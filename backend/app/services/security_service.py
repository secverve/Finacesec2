from datetime import UTC, datetime, timedelta
from decimal import Decimal
import hashlib

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.enums import (
    AdditionalAuthStatus,
    AuthStrength,
    DeviceActionType,
    DeviceTrustStatus,
    OrderStatus,
    RiskDecision,
    RiskEventStatus,
    RiskSeverity,
    SessionStatus,
)
from app.fds.types import RequestContext
from app.models.additional_auth_request import AdditionalAuthRequest
from app.models.auth_session import AuthSession
from app.models.audit_log import AuditLog
from app.models.login_history import LoginHistory
from app.models.risk_event import RiskEvent
from app.models.security_device import SecurityDevice
from app.models.stock import Stock
from app.models.user import User
from app.services.audit_service import record_audit


def _utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _fingerprint(device_id: str, user_agent: str) -> str:
    raw = f"{device_id}:{user_agent}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def upsert_security_device(db: Session, user: User, context: RequestContext) -> SecurityDevice:
    settings = get_settings()
    device = db.scalar(
        select(SecurityDevice).where(
            SecurityDevice.user_id == user.id,
            SecurityDevice.device_id == context.device_id,
        )
    )
    abnormal_region = context.region in settings.abnormal_region_codes
    display_name = f"{context.channel.upper()}-{context.region}-{context.device_id[:8]}"

    if device is None:
        trust_status = DeviceTrustStatus.STEP_UP_REQUIRED if abnormal_region else DeviceTrustStatus.WATCH
        device = SecurityDevice(
            user_id=user.id,
            device_id=context.device_id,
            display_name=display_name,
            fingerprint_hash=_fingerprint(context.device_id, context.user_agent),
            trust_status=trust_status,
            risk_score=55 if abnormal_region else 25,
            compromise_signals=1 if abnormal_region else 0,
            is_primary=not bool(user.security_devices),
            first_seen_at=_utc_now_naive(),
            last_seen_at=_utc_now_naive(),
            last_ip_address=context.ip_address,
            last_region=context.region,
            last_user_agent=context.user_agent,
        )
        db.add(device)
        db.flush()
        return device

    device.last_seen_at = _utc_now_naive()
    device.last_ip_address = context.ip_address
    device.last_region = context.region
    device.last_user_agent = context.user_agent
    device.display_name = device.display_name or display_name
    if abnormal_region and device.trust_status != DeviceTrustStatus.BLOCKED:
        device.trust_status = DeviceTrustStatus.STEP_UP_REQUIRED
        device.risk_score = max(device.risk_score, 55)
        device.compromise_signals = max(device.compromise_signals, 1)
    db.flush()
    return device


def create_authenticated_session(db: Session, user: User, security_device: SecurityDevice, context: RequestContext) -> AuthSession:
    settings = get_settings()
    active_session_count = db.scalar(
        select(func.count(AuthSession.id)).where(
            AuthSession.user_id == user.id,
            AuthSession.status == SessionStatus.ACTIVE,
            AuthSession.expires_at > _utc_now_naive(),
        )
    )

    auth_strength = AuthStrength.PASSWORD_ONLY
    if security_device.trust_status == DeviceTrustStatus.TRUSTED:
        auth_strength = AuthStrength.PASSWORD_PLUS_DEVICE
    elif security_device.trust_status in {DeviceTrustStatus.STEP_UP_REQUIRED, DeviceTrustStatus.BLOCKED}:
        auth_strength = AuthStrength.STEP_UP_REQUIRED

    concurrency_risk = 15 if int(active_session_count or 0) >= settings.session_concurrency_threshold else 0
    session = AuthSession(
        user_id=user.id,
        security_device_id=security_device.id,
        device_id=context.device_id,
        ip_address=context.ip_address,
        region=context.region,
        user_agent=context.user_agent,
        auth_strength=auth_strength,
        status=SessionStatus.ACTIVE,
        risk_score=max(security_device.risk_score + concurrency_risk, 0),
        last_seen_at=_utc_now_naive(),
        expires_at=_utc_now_naive() + timedelta(minutes=settings.access_token_expire_minutes),
    )
    db.add(session)
    db.flush()
    return session


def revoke_session(session: AuthSession, reason: str) -> None:
    session.status = SessionStatus.REVOKED
    session.revoked_reason = reason


def revoke_device_sessions(db: Session, security_device: SecurityDevice, reason: str) -> int:
    sessions = list(
        db.scalars(
            select(AuthSession).where(
                AuthSession.security_device_id == security_device.id,
                AuthSession.status == SessionStatus.ACTIVE,
            )
        ).all()
    )
    for session in sessions:
        revoke_session(session, reason)
    db.flush()
    return len(sessions)


def enforce_order_security_controls(
    db: Session,
    user: User,
    stock: Stock,
    order,
    risk_event: RiskEvent,
    current_session: AuthSession | None,
    context: RequestContext,
) -> None:
    if current_session is None:
        return

    settings = get_settings()
    order_amount = Decimal(str(order.price or stock.current_price)) * Decimal(order.quantity)
    security_device = current_session.security_device
    requires_step_up = False
    control_reason = ""

    if security_device and security_device.trust_status == DeviceTrustStatus.BLOCKED:
        risk_event.decision = RiskDecision.BLOCKED
        risk_event.status = RiskEventStatus.BLOCKED
        risk_event.severity = RiskSeverity.CRITICAL
        risk_event.summary = f"{risk_event.summary} | Blocked by device trust control."
        order.status = OrderStatus.BLOCKED
        record_audit(
            db=db,
            actor_user_id=user.id,
            event_type="ORDER_SECURITY_BLOCKED",
            target_type="ORDER",
            target_id=order.id,
            context=context,
            payload={
                "risk_event_id": risk_event.id,
                "device_id": context.device_id,
                "control_reason": "BLOCKED_DEVICE",
                "status": order.status.value,
            },
        )
        db.flush()
        return

    if current_session.auth_strength == AuthStrength.STEP_UP_REQUIRED:
        requires_step_up = True
        control_reason = "SESSION_STEP_UP_REQUIRED"
    elif security_device and security_device.trust_status in {DeviceTrustStatus.WATCH, DeviceTrustStatus.STEP_UP_REQUIRED}:
        if order_amount >= settings.high_value_step_up_threshold:
            requires_step_up = True
            control_reason = "UNTRUSTED_DEVICE_HIGH_VALUE_ORDER"
    elif current_session.risk_score >= 60 and order_amount >= settings.high_amount_threshold:
        requires_step_up = True
        control_reason = "HIGH_RISK_SESSION_HIGH_VALUE_ORDER"

    if not requires_step_up or risk_event.decision == RiskDecision.BLOCKED:
        return

    risk_event.decision = RiskDecision.AUTH_REQUIRED
    risk_event.status = RiskEventStatus.AUTH_REQUIRED
    if risk_event.severity == RiskSeverity.NORMAL:
        risk_event.severity = RiskSeverity.CAUTION
    risk_event.summary = f"{risk_event.summary} | Step-up auth required by security policy."
    order.status = OrderStatus.HELD

    existing_request = db.scalar(
        select(AdditionalAuthRequest).where(
            AdditionalAuthRequest.risk_event_id == risk_event.id,
            AdditionalAuthRequest.status == AdditionalAuthStatus.PENDING,
        )
    )
    if existing_request is None:
        db.add(
            AdditionalAuthRequest(
                user_id=user.id,
                risk_event_id=risk_event.id,
                status=AdditionalAuthStatus.PENDING,
            )
        )

    order.metadata_json = {
        **(order.metadata_json or {}),
        "security_controls": {
            "step_up_required": True,
            "control_reason": control_reason,
            "session_id": current_session.id,
            "device_id": context.device_id,
        },
    }
    record_audit(
        db=db,
        actor_user_id=user.id,
        event_type="ORDER_SECURITY_STEP_UP",
        target_type="ORDER",
        target_id=order.id,
        context=context,
        payload={
            "risk_event_id": risk_event.id,
            "device_id": context.device_id,
            "session_id": current_session.id,
            "control_reason": control_reason,
            "status": order.status.value,
            "decision": risk_event.decision.value,
        },
    )
    db.flush()


def build_security_policy_catalog() -> list[dict]:
    settings = get_settings()
    return [
        {
            "policy_code": "AUTH-LOCK-001",
            "title": "로그인 실패 누적 잠금",
            "layer": "인증",
            "mode": "PREVENTIVE",
            "status": "ENABLED",
            "threshold": f"{settings.login_failure_lock_threshold}회 실패",
            "description": "로그인 실패가 누적되면 계정을 잠가 계정대입 공격을 완화합니다.",
        },
        {
            "policy_code": "DEV-TRUST-002",
            "title": "신규 단말 단계인증",
            "layer": "단말",
            "mode": "DETECT_AND_CHALLENGE",
            "status": "ENABLED",
            "threshold": f"고액 주문 {settings.high_value_step_up_threshold:,}원 이상",
            "description": "신뢰되지 않은 단말에서 고액 주문이 발생하면 추가 인증을 요구합니다.",
        },
        {
            "policy_code": "SESS-MON-003",
            "title": "동시 세션 모니터링",
            "layer": "세션",
            "mode": "DETECTIVE",
            "status": "ENABLED",
            "threshold": f"동시 세션 {settings.session_concurrency_threshold}개 이상",
            "description": "동일 사용자 다중 세션을 감지해 세션 위험 점수에 반영합니다.",
        },
        {
            "policy_code": "ORD-CTRL-004",
            "title": "고액 주문 Step-up 통제",
            "layer": "주문",
            "mode": "PREVENTIVE",
            "status": "ENABLED",
            "threshold": f"{settings.high_amount_threshold:,}원 이상",
            "description": "고액 주문은 단말/세션 신뢰 수준에 따라 보류 또는 차단합니다.",
        },
        {
            "policy_code": "AUD-TRACE-005",
            "title": "추적 ID 기반 감사 로그",
            "layer": "감사",
            "mode": "FORENSIC",
            "status": "ENABLED",
            "threshold": "요청 단위 전부 기록",
            "description": "모든 로그인, 주문, 관리자 조치에 추적 ID와 요청 메타데이터를 남깁니다.",
        },
    ]


def get_security_overview(db: Session) -> dict:
    now = _utc_now_naive()
    last_day = now - timedelta(hours=24)
    active_sessions = list(
        db.scalars(
            select(AuthSession).where(
                AuthSession.status == SessionStatus.ACTIVE,
                AuthSession.expires_at > now,
            )
        ).all()
    )
    devices = list(db.scalars(select(SecurityDevice)).all())
    recent_logins = list(db.scalars(select(AuditLog).where(AuditLog.created_at >= last_day)).all())
    concurrent_users = len(
        {
            session.user_id
            for session in active_sessions
            if sum(1 for candidate in active_sessions if candidate.user_id == session.user_id) > 1
        }
    )

    return {
        "open_risk_events": db.scalar(
            select(func.count(RiskEvent.id)).where(
                RiskEvent.status.in_(
                    [
                        RiskEventStatus.OPEN,
                        RiskEventStatus.AUTH_REQUIRED,
                        RiskEventStatus.BLOCKED,
                    ]
                )
            )
        )
        or 0,
        "auth_required_events": db.scalar(
            select(func.count(RiskEvent.id)).where(RiskEvent.status == RiskEventStatus.AUTH_REQUIRED)
        )
        or 0,
        "active_sessions": len(active_sessions),
        "step_up_sessions": sum(1 for session in active_sessions if session.auth_strength == AuthStrength.STEP_UP_REQUIRED),
        "revoked_sessions_24h": db.scalar(
            select(func.count(AuthSession.id)).where(
                AuthSession.status == SessionStatus.REVOKED,
                AuthSession.updated_at >= last_day,
            )
        )
        or 0,
        "trusted_devices": sum(1 for device in devices if device.trust_status == DeviceTrustStatus.TRUSTED),
        "watch_devices": sum(1 for device in devices if device.trust_status == DeviceTrustStatus.WATCH),
        "step_up_devices": sum(1 for device in devices if device.trust_status == DeviceTrustStatus.STEP_UP_REQUIRED),
        "blocked_devices": sum(1 for device in devices if device.trust_status == DeviceTrustStatus.BLOCKED),
        "pending_additional_auth": db.scalar(
            select(func.count(AdditionalAuthRequest.id)).where(AdditionalAuthRequest.status == AdditionalAuthStatus.PENDING)
        )
        or 0,
        "anomalous_logins_24h": sum(1 for log in recent_logins if log.region in get_settings().abnormal_region_codes),
        "concurrent_session_users": concurrent_users,
    }


def list_security_devices(db: Session) -> list[dict]:
    devices = list(
        db.scalars(select(SecurityDevice).options(joinedload(SecurityDevice.user), joinedload(SecurityDevice.sessions))).unique().all()
    )
    return [
        {
            "id": device.id,
            "user_id": device.user_id,
            "user_email": device.user.email if device.user else "",
            "device_id": device.device_id,
            "display_name": device.display_name,
            "trust_status": device.trust_status.value,
            "risk_score": device.risk_score,
            "compromise_signals": device.compromise_signals,
            "is_primary": device.is_primary,
            "last_ip_address": device.last_ip_address,
            "last_region": device.last_region,
            "last_user_agent": device.last_user_agent,
            "active_session_count": sum(1 for session in device.sessions if session.status == SessionStatus.ACTIVE),
            "created_at": device.created_at,
            "updated_at": device.updated_at,
        }
        for device in devices
    ]


def list_auth_sessions(db: Session) -> list[dict]:
    now = _utc_now_naive()
    sessions = list(
        db.scalars(
            select(AuthSession)
            .options(joinedload(AuthSession.user), joinedload(AuthSession.security_device))
            .order_by(AuthSession.created_at.desc())
            .limit(200)
        ).unique().all()
    )
    return [
        {
            "id": session.id,
            "user_id": session.user_id,
            "user_email": session.user.email if session.user else "",
            "device_id": session.device_id,
            "device_label": session.security_device.display_name if session.security_device else session.device_id,
            "device_trust_status": session.security_device.trust_status.value if session.security_device else "UNKNOWN",
            "ip_address": session.ip_address,
            "region": session.region,
            "user_agent": session.user_agent,
            "auth_strength": session.auth_strength.value,
            "status": SessionStatus.EXPIRED.value if session.status == SessionStatus.ACTIVE and session.expires_at <= now else session.status.value,
            "risk_score": session.risk_score,
            "expires_at": session.expires_at,
            "last_seen_at": session.last_seen_at,
            "created_at": session.created_at,
            "revoked_reason": session.revoked_reason,
        }
        for session in sessions
    ]


def apply_device_action(
    db: Session,
    security_device_id: str,
    admin_user: User,
    action_type: DeviceActionType,
    comment: str,
    context: RequestContext,
) -> dict:
    device = db.get(SecurityDevice, security_device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Security device not found")

    if action_type == DeviceActionType.TRUST:
        device.trust_status = DeviceTrustStatus.TRUSTED
        device.risk_score = min(device.risk_score, 10)
        device.compromise_signals = 0
    elif action_type == DeviceActionType.STEP_UP:
        device.trust_status = DeviceTrustStatus.STEP_UP_REQUIRED
        device.risk_score = max(device.risk_score, 45)
    elif action_type == DeviceActionType.BLOCK:
        device.trust_status = DeviceTrustStatus.BLOCKED
        device.risk_score = max(device.risk_score, 90)
        revoke_device_sessions(db, device, "DEVICE_BLOCKED_BY_ADMIN")
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported device action")

    record_audit(
        db=db,
        actor_user_id=admin_user.id,
        event_type="SECURITY_DEVICE_ACTION",
        target_type="SECURITY_DEVICE",
        target_id=device.id,
        context=context,
        payload={
            "action_type": action_type.value,
            "comment": comment,
            "device_id": device.device_id,
            "trust_status": device.trust_status.value,
            "risk_score": device.risk_score,
        },
    )
    db.flush()
    return {"message": f"{action_type.value} applied to device {device.device_id}"}


def revoke_auth_session(
    db: Session,
    auth_session_id: str,
    admin_user: User,
    reason: str,
    context: RequestContext,
) -> dict:
    session = db.get(AuthSession, auth_session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auth session not found")

    revoke_session(session, reason)
    record_audit(
        db=db,
        actor_user_id=admin_user.id,
        event_type="SECURITY_SESSION_REVOKED",
        target_type="AUTH_SESSION",
        target_id=session.id,
        context=context,
        payload={
            "reason": reason,
            "user_id": session.user_id,
            "device_id": session.device_id,
            "status": session.status.value,
        },
    )
    db.flush()
    return {"message": f"Session {session.id} revoked"}


def build_incident_timeline(db: Session, risk_event: RiskEvent) -> list[dict]:
    entries = [
        {
            "timestamp": risk_event.created_at,
            "category": "RISK_EVENT",
            "severity": risk_event.severity.value,
            "title": "위험 이벤트 생성",
            "detail": risk_event.summary,
            "source_type": "RISK_EVENT",
            "source_id": risk_event.id,
        }
    ]

    for hit in risk_event.rule_hits:
        entries.append(
            {
                "timestamp": hit.created_at,
                "category": "RULE_HIT",
                "severity": hit.severity.value,
                "title": f"룰 히트: {hit.rule_name}",
                "detail": hit.reason,
                "source_type": "RULE_HIT",
                "source_id": hit.id,
            }
        )

    for action in risk_event.admin_actions:
        entries.append(
            {
                "timestamp": action.created_at,
                "category": "ADMIN_ACTION",
                "severity": "CAUTION",
                "title": f"관리자 조치: {action.action_type.value}",
                "detail": action.comment,
                "source_type": "ADMIN_ACTION",
                "source_id": action.id,
            }
        )

    user_logins = list(
        db.scalars(
            select(LoginHistory)
            .where(LoginHistory.user_id == risk_event.user_id)
            .order_by(LoginHistory.created_at.desc())
            .limit(6)
        ).all()
    )
    for login in user_logins:
        entries.append(
            {
                "timestamp": login.created_at,
                "category": "LOGIN",
                "severity": "NORMAL" if login.success else "SUSPICIOUS",
                "title": "로그인 성공" if login.success else "로그인 실패",
                "detail": f"{login.ip_address} / {login.region} / {login.device_id}",
                "source_type": "LOGIN_HISTORY",
                "source_id": login.id,
            }
        )

    user_sessions = list(
        db.scalars(
            select(AuthSession)
            .where(AuthSession.user_id == risk_event.user_id)
            .order_by(AuthSession.created_at.desc())
            .limit(6)
        ).all()
    )
    for session in user_sessions:
        entries.append(
            {
                "timestamp": session.created_at,
                "category": "SESSION",
                "severity": "CAUTION" if session.auth_strength == AuthStrength.STEP_UP_REQUIRED else "NORMAL",
                "title": f"세션 {session.status.value}",
                "detail": f"{session.device_id} / {session.ip_address} / {session.auth_strength.value}",
                "source_type": "AUTH_SESSION",
                "source_id": session.id,
            }
        )

    related_audits = list(
        db.scalars(
            select(AuditLog)
            .where(
                AuditLog.actor_user_id == risk_event.user_id,
                AuditLog.created_at >= risk_event.created_at - timedelta(hours=12),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(30)
        ).all()
    )
    for log in related_audits:
        payload = log.payload.get("data", {}) if isinstance(log.payload, dict) else {}
        if log.target_id not in {risk_event.id, risk_event.order_id, None} and payload.get("risk_event_id") != risk_event.id:
            continue
        entries.append(
            {
                "timestamp": log.created_at,
                "category": "AUDIT",
                "severity": "CAUTION" if "BLOCK" in log.event_type or "STEP_UP" in log.event_type else "NORMAL",
                "title": log.event_type,
                "detail": str(payload)[:180],
                "source_type": "AUDIT_LOG",
                "source_id": log.id,
            }
        )

    return sorted(entries, key=lambda entry: entry["timestamp"], reverse=True)

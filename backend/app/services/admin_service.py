from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.enums import AdditionalAuthStatus, AdminActionType, OrderStatus, RiskDecision, RiskEventStatus, SessionStatus, UserStatus
from app.fds.rules import build_rule_catalog
from app.fds.types import RequestContext
from app.models.additional_auth_request import AdditionalAuthRequest
from app.models.admin_action import AdminAction
from app.models.audit_log import AuditLog
from app.models.auth_session import AuthSession
from app.models.order import Order
from app.models.risk_event import RiskEvent
from app.models.user import User
from app.schemas.admin import AdminActionRequest
from app.services.audit_service import record_audit
from app.services.security_service import (
    apply_device_action,
    build_incident_timeline,
    build_security_policy_catalog,
    get_security_overview,
    list_auth_sessions,
    list_security_devices,
    revoke_auth_session,
    revoke_session,
)
from app.services.trading_service import execute_order_if_possible


def list_risk_events(db: Session) -> list[RiskEvent]:
    statement = (
        select(RiskEvent)
        .options(joinedload(RiskEvent.rule_hits), joinedload(RiskEvent.admin_actions))
        .order_by(RiskEvent.created_at.desc())
    )
    return list(db.scalars(statement).unique().all())


def get_risk_event_detail(db: Session, risk_event_id: str) -> RiskEvent | None:
    statement = (
        select(RiskEvent)
        .where(RiskEvent.id == risk_event_id)
        .options(
            joinedload(RiskEvent.rule_hits),
            joinedload(RiskEvent.admin_actions),
            joinedload(RiskEvent.order).joinedload(Order.stock),
            joinedload(RiskEvent.order).joinedload(Order.account),
            joinedload(RiskEvent.user),
        )
    )
    return db.scalar(statement)


def list_audit_logs(db: Session) -> list[AuditLog]:
    statement = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)
    return list(db.scalars(statement).all())


def _feed_source(event_type: str) -> str:
    if event_type.startswith("LOGIN") or event_type == "LOGOUT":
        return "AUTH"
    if "SESSION" in event_type:
        return "SESSION"
    if "DEVICE" in event_type:
        return "DEVICE"
    if event_type.startswith("ADMIN_"):
        return "ADMIN"
    if event_type.startswith("LAB_"):
        return "LAB"
    return "FDS"


def _feed_severity(log: AuditLog) -> str:
    payload = log.payload.get("data", {}) if isinstance(log.payload, dict) else {}
    indicators = log.payload.get("indicators", {}) if isinstance(log.payload, dict) else {}
    risk_score = indicators.get("risk_score") or payload.get("risk_score") or 0
    decision = indicators.get("decision") or payload.get("decision") or payload.get("risk_decision")
    event_type = log.event_type

    if event_type in {"ORDER_SECURITY_BLOCKED", "LOGIN_BLOCKED", "SECURITY_SESSION_REVOKED"}:
        return "CRITICAL"
    if event_type == "SECURITY_DEVICE_ACTION" and payload.get("action_type") == "BLOCK":
        return "CRITICAL"
    if decision == "BLOCKED" or int(risk_score or 0) >= 80:
        return "CRITICAL"
    if event_type in {"ORDER_SECURITY_STEP_UP", "LOGIN_FAILED"}:
        return "SUSPICIOUS"
    if decision == "AUTH_REQUIRED" or "STEP_UP" in event_type or int(risk_score or 0) >= 40:
        return "SUSPICIOUS"
    if int(risk_score or 0) >= 20 or event_type.startswith("ORDER_"):
        return "CAUTION"
    return "NORMAL"


def _feed_headline(log: AuditLog) -> str:
    payload = log.payload.get("data", {}) if isinstance(log.payload, dict) else {}
    mapping = {
        "LOGIN_SUCCEEDED": "인증 성공 및 세션 발급",
        "LOGIN_FAILED": "로그인 실패 탐지",
        "LOGIN_BLOCKED": "잠긴 계정 또는 차단 단말 로그인 차단",
        "ORDER_CREATED": "주문 생성 및 FDS 평가",
        "ORDER_EXECUTED": "주문 체결 완료",
        "ORDER_SECURITY_STEP_UP": "고액 주문 추가 인증 요구",
        "ORDER_SECURITY_BLOCKED": "보안 정책 기반 주문 차단",
        "SECURITY_DEVICE_ACTION": f"단말 통제 조치 {payload.get('action_type', '-')}",
        "SECURITY_SESSION_REVOKED": "세션 강제 회수",
        "ADMIN_ACTION": f"관리자 사건 조치 {payload.get('action_type', '-')}",
        "LAB_SCENARIO_EXECUTED": "모의 공격 시나리오 실행",
    }
    return mapping.get(log.event_type, log.event_type)


def _feed_detail(log: AuditLog) -> str:
    payload = log.payload.get("data", {}) if isinstance(log.payload, dict) else {}
    request_meta = log.payload.get("request", {}) if isinstance(log.payload, dict) else {}
    parts = []
    if payload.get("symbol"):
        parts.append(f"종목 {payload['symbol']}")
    if payload.get("risk_score") is not None:
        parts.append(f"점수 {payload['risk_score']}")
    if payload.get("decision"):
        parts.append(f"판정 {payload['decision']}")
    if payload.get("action_type"):
        parts.append(f"조치 {payload['action_type']}")
    if payload.get("control_reason"):
        parts.append(f"통제 {payload['control_reason']}")
    if request_meta.get("request_id"):
        parts.append(f"REQ {request_meta['request_id']}")
    parts.append(f"{log.ip_address}/{log.region}/{log.device_id}")
    return " | ".join(parts[:6])


def list_security_feed(db: Session) -> list[dict]:
    logs = list_audit_logs(db)
    return [
        {
            "timestamp": log.created_at,
            "severity": _feed_severity(log),
            "source": _feed_source(log.event_type),
            "channel": (log.payload.get("event", {}) if isinstance(log.payload, dict) else {}).get("channel", "web"),
            "headline": _feed_headline(log),
            "detail": _feed_detail(log),
            "correlation_key": (log.payload.get("trace", {}) if isinstance(log.payload, dict) else {}).get("request_id", "-"),
            "ip_address": log.ip_address,
            "region": log.region,
            "device_id": log.device_id,
        }
        for log in logs[:120]
    ]


def list_rule_catalog() -> list[dict]:
    return [
        {
            "rule_code": rule.rule_code,
            "rule_name": rule.rule_name,
            "description": rule.description,
            "score": rule.score,
            "severity": rule.severity.value,
        }
        for rule in build_rule_catalog()
    ]


def list_security_policy_catalog() -> list[dict]:
    return build_security_policy_catalog()


def list_security_devices_view(db: Session) -> list[dict]:
    return list_security_devices(db)


def list_auth_sessions_view(db: Session) -> list[dict]:
    return list_auth_sessions(db)


def get_security_overview_view(db: Session) -> dict:
    return get_security_overview(db)


def _get_risk_event_or_404(db: Session, risk_event_id: str) -> RiskEvent:
    risk_event = get_risk_event_detail(db, risk_event_id)
    if risk_event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk event not found")
    return risk_event


def get_incident_timeline(db: Session, risk_event_id: str) -> list[dict]:
    risk_event = _get_risk_event_or_404(db, risk_event_id)
    return build_incident_timeline(db, risk_event)


def apply_admin_action(
    db: Session,
    risk_event_id: str,
    admin_user: User,
    payload: AdminActionRequest,
    context: RequestContext,
) -> AdminAction:
    risk_event = _get_risk_event_or_404(db, risk_event_id)
    order = risk_event.order

    action = AdminAction(
        risk_event_id=risk_event.id,
        admin_user_id=admin_user.id,
        action_type=payload.action_type,
        comment=payload.comment,
    )
    db.add(action)

    if payload.action_type == AdminActionType.APPROVE:
        risk_event.decision = RiskDecision.ALLOW
        risk_event.status = RiskEventStatus.APPROVED
        if order is not None and order.status in {OrderStatus.HELD, OrderStatus.BLOCKED, OrderStatus.PENDING}:
            order.status = OrderStatus.PENDING
            execute_order_if_possible(db, order, order.stock, order.account)
    elif payload.action_type == AdminActionType.BLOCK:
        risk_event.decision = RiskDecision.BLOCKED
        risk_event.status = RiskEventStatus.BLOCKED
        if order is not None:
            order.status = OrderStatus.BLOCKED
    elif payload.action_type == AdminActionType.REQUEST_ADDITIONAL_AUTH:
        risk_event.decision = RiskDecision.AUTH_REQUIRED
        risk_event.status = RiskEventStatus.AUTH_REQUIRED
        if order is not None:
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
                    user_id=risk_event.user_id,
                    risk_event_id=risk_event.id,
                    status=AdditionalAuthStatus.PENDING,
                )
            )
    elif payload.action_type == AdminActionType.LOCK_ACCOUNT:
        risk_event.user.status = UserStatus.LOCKED
        risk_event.decision = RiskDecision.BLOCKED
        risk_event.status = RiskEventStatus.BLOCKED
        if order is not None:
            order.status = OrderStatus.BLOCKED
        active_sessions = list(
            db.scalars(
                select(AuthSession).where(
                    AuthSession.user_id == risk_event.user_id,
                    AuthSession.status == SessionStatus.ACTIVE,
                )
            ).all()
        )
        for session in active_sessions:
            revoke_session(session, "ACCOUNT_LOCKED_BY_ADMIN")
    elif payload.action_type == AdminActionType.UNLOCK_ACCOUNT:
        risk_event.user.status = UserStatus.ACTIVE
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported admin action")

    record_audit(
        db=db,
        actor_user_id=admin_user.id,
        event_type="ADMIN_ACTION",
        target_type="RISK_EVENT",
        target_id=risk_event.id,
        context=context,
        payload={
            "action_type": payload.action_type.value,
            "comment": payload.comment,
            "status": risk_event.status.value,
            "decision": risk_event.decision.value,
            "order_status": order.status.value if order is not None else None,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )
    db.flush()
    return action


__all__ = [
    "apply_admin_action",
    "apply_device_action",
    "get_incident_timeline",
    "get_risk_event_detail",
    "get_security_overview_view",
    "list_audit_logs",
    "list_auth_sessions_view",
    "list_risk_events",
    "list_rule_catalog",
    "list_security_feed",
    "list_security_devices_view",
    "list_security_policy_catalog",
    "revoke_auth_session",
]

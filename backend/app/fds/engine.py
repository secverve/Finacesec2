from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import OrderStatus, RiskDecision, RiskEventStatus, RiskSeverity
from app.fds.rules import evaluate_rules
from app.fds.types import RequestContext, RuleContext, RuleHitResult
from app.models.audit_log import AuditLog
from app.models.device_history import DeviceHistory
from app.models.login_history import LoginHistory
from app.models.order import Order
from app.models.stock import Stock
from app.models.user import User
from app.models.user_behavior_profile import UserBehaviorProfile


@dataclass(slots=True)
class RiskEvaluationResult:
    total_score: int
    severity: RiskSeverity
    decision: RiskDecision
    status: RiskEventStatus
    summary: str
    rule_hits: list[RuleHitResult]


def determine_risk_band(total_score: int) -> tuple[RiskSeverity, RiskDecision, RiskEventStatus]:
    if total_score >= 80:
        return RiskSeverity.CRITICAL, RiskDecision.BLOCKED, RiskEventStatus.BLOCKED
    if total_score >= 60:
        return RiskSeverity.SUSPICIOUS, RiskDecision.HELD, RiskEventStatus.OPEN
    if total_score >= 30:
        return RiskSeverity.CAUTION, RiskDecision.ALLOW, RiskEventStatus.AUTO_ALLOWED
    return RiskSeverity.NORMAL, RiskDecision.ALLOW, RiskEventStatus.AUTO_ALLOWED


def evaluate_order_risk(
    db: Session,
    user: User,
    stock: Stock,
    order: Order,
    request_context: RequestContext,
) -> RiskEvaluationResult:
    settings = get_settings()
    now = datetime.now(UTC)
    order_amount = Decimal(str(order.price or stock.current_price)) * Decimal(order.quantity)

    latest_success_login = db.scalar(
        select(LoginHistory)
        .where(LoginHistory.user_id == user.id, LoginHistory.success.is_(True))
        .order_by(LoginHistory.created_at.desc())
        .limit(1)
    )
    failed_window = now - timedelta(minutes=settings.login_failure_window_minutes)
    recent_failed_logins = db.scalar(
        select(func.count(LoginHistory.id)).where(
            LoginHistory.user_id == user.id,
            LoginHistory.success.is_(False),
            LoginHistory.created_at >= failed_window,
        )
    )
    known_device = db.scalar(
        select(DeviceHistory).where(
            DeviceHistory.user_id == user.id,
            DeviceHistory.device_id == request_context.device_id,
        )
    )
    behavior_profile = db.scalar(
        select(UserBehaviorProfile).where(UserBehaviorProfile.user_id == user.id)
    )
    cancel_window = now - timedelta(minutes=settings.order_cancel_window_minutes)
    recent_cancel_or_modify_count = db.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.actor_user_id == user.id,
            AuditLog.event_type.in_(["ORDER_CANCELLED", "ORDER_MODIFIED"]),
            AuditLog.created_at >= cancel_window,
        )
    )
    multi_account_window = now - timedelta(minutes=settings.multi_account_window_minutes)
    same_ip_peer_orders = db.scalar(
        select(func.count(Order.id)).where(
            Order.ip_address == request_context.ip_address,
            Order.user_id != user.id,
            Order.stock_id == stock.id,
            Order.created_at >= multi_account_window,
            Order.status.in_(
                [
                    OrderStatus.ACCEPTED,
                    OrderStatus.HELD,
                    OrderStatus.BLOCKED,
                    OrderStatus.EXECUTED,
                ]
            ),
        )
    )

    context = RuleContext(
        user=user,
        account=user.account,
        stock=stock,
        order=order,
        request_context=request_context,
        order_amount=order_amount,
        latest_success_login=latest_success_login,
        recent_failed_logins=int(recent_failed_logins or 0),
        is_new_device=known_device is None,
        behavior_profile=behavior_profile,
        recent_cancel_or_modify_count=int(recent_cancel_or_modify_count or 0),
        same_ip_peer_orders=int(same_ip_peer_orders or 0),
        known_device=known_device,
    )
    hits = evaluate_rules(context)
    total_score = sum(hit.score for hit in hits)
    severity, decision, status = determine_risk_band(total_score)
    summary = " | ".join(hit.reason for hit in hits) if hits else "No elevated signals detected."
    return RiskEvaluationResult(
        total_score=total_score,
        severity=severity,
        decision=decision,
        status=status,
        summary=summary,
        rule_hits=hits,
    )

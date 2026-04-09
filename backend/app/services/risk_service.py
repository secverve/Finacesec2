from sqlalchemy.orm import Session

from app.fds.engine import RiskEvaluationResult, evaluate_order_risk
from app.fds.types import RequestContext
from app.models.order import Order
from app.models.risk_event import RiskEvent
from app.models.rule_hit import RuleHit
from app.models.stock import Stock
from app.models.user import User


def evaluate_and_persist_order_risk(
    db: Session,
    user: User,
    stock: Stock,
    order: Order,
    request_context: RequestContext,
) -> tuple[RiskEvent, RiskEvaluationResult]:
    evaluation = evaluate_order_risk(db, user, stock, order, request_context)
    risk_event = RiskEvent(
        user_id=user.id,
        order_id=order.id,
        total_score=evaluation.total_score,
        severity=evaluation.severity,
        decision=evaluation.decision,
        status=evaluation.status,
        summary=evaluation.summary,
        ip_address=request_context.ip_address,
        region=request_context.region,
        device_id=request_context.device_id,
        symbol=stock.symbol,
    )
    db.add(risk_event)
    db.flush()

    for hit in evaluation.rule_hits:
        db.add(
            RuleHit(
                risk_event_id=risk_event.id,
                rule_code=hit.rule_code,
                rule_name=hit.rule_name,
                description=hit.description,
                score=hit.score,
                severity=hit.severity,
                reason=hit.reason,
            )
        )

    order.fds_score = evaluation.total_score
    db.flush()
    return risk_event, evaluation


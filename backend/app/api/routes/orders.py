from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_request_context
from app.core.enums import RiskDecision, RiskSeverity
from app.db.session import get_db
from app.fds.types import RequestContext
from app.models.order import Order
from app.models.user import User
from app.schemas.order import OrderCreateRequest, OrderResponse
from app.services.order_service import cancel_order, create_order, list_orders

router = APIRouter()


def serialize_order(order: Order) -> OrderResponse:
    risk_event = order.risk_event
    risk_severity = risk_event.severity if risk_event else RiskSeverity.NORMAL
    risk_decision = risk_event.decision if risk_event else RiskDecision.ALLOW
    return OrderResponse(
        id=order.id,
        symbol=order.stock.symbol,
        stock_name=order.stock.name,
        side=order.side,
        order_type=order.order_type,
        status=order.status,
        quantity=order.quantity,
        price=order.price,
        executed_price=order.executed_price,
        executed_quantity=order.executed_quantity,
        fds_score=order.fds_score,
        risk_severity=risk_severity,
        risk_decision=risk_decision,
        created_at=order.created_at,
    )


@router.get("", response_model=list[OrderResponse])
def get_orders(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[OrderResponse]:
    orders = list_orders(db, current_user)
    return [serialize_order(order) for order in orders]


@router.post("", response_model=OrderResponse, status_code=201)
def submit_order(
    payload: OrderCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> OrderResponse:
    order = create_order(db, current_user, payload, request_context)
    db.commit()
    db.refresh(order)
    return serialize_order(order)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_existing_order(
    order_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> OrderResponse:
    order = cancel_order(db, current_user, order_id, request_context)
    db.commit()
    db.refresh(order)
    return serialize_order(order)


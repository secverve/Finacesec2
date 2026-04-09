from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.enums import OrderStatus, OrderType, RiskDecision
from app.fds.types import RequestContext
from app.models.account import Account
from app.models.order import Order
from app.models.stock import Stock
from app.models.user import User
from app.schemas.order import OrderCreateRequest
from app.services.audit_service import record_audit
from app.services.risk_service import evaluate_and_persist_order_risk
from app.services.trading_service import execute_order_if_possible


def _get_user_account(db: Session, user: User, account_id: str) -> Account:
    account = db.scalar(select(Account).where(Account.id == account_id, Account.user_id == user.id))
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


def _get_stock(db: Session, symbol: str) -> Stock:
    stock = db.scalar(select(Stock).where(Stock.symbol == symbol.upper()))
    if stock is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock not found")
    return stock


def create_order(db: Session, user: User, payload: OrderCreateRequest, context: RequestContext) -> Order:
    account = _get_user_account(db, user, payload.account_id)
    stock = _get_stock(db, payload.symbol)

    if payload.order_type == OrderType.LIMIT and payload.price is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Limit orders require a price")

    order = Order(
        user_id=user.id,
        account_id=account.id,
        stock_id=stock.id,
        side=payload.side,
        order_type=payload.order_type,
        quantity=payload.quantity,
        price=payload.price,
        status=OrderStatus.PENDING,
        ip_address=context.ip_address,
        region=context.region,
        device_id=context.device_id,
        metadata_json={"submitted_via": "api"},
    )
    db.add(order)
    db.flush()

    risk_event, evaluation = evaluate_and_persist_order_risk(db, user, stock, order, context)
    if evaluation.decision == RiskDecision.BLOCKED:
        order.status = OrderStatus.BLOCKED
    elif evaluation.decision == RiskDecision.HELD:
        order.status = OrderStatus.HELD
    else:
        execute_order_if_possible(db, order, stock, account)

    record_audit(
        db=db,
        actor_user_id=user.id,
        event_type="ORDER_CREATED",
        target_type="ORDER",
        target_id=order.id,
        context=context,
        payload={
            "symbol": stock.symbol,
            "quantity": order.quantity,
            "status": order.status.value,
            "risk_event_id": risk_event.id,
            "risk_score": evaluation.total_score,
        },
    )
    db.flush()
    return order


def list_orders(db: Session, user: User) -> list[Order]:
    statement = (
        select(Order)
        .where(Order.user_id == user.id)
        .options(joinedload(Order.stock), joinedload(Order.risk_event))
        .order_by(Order.created_at.desc())
    )
    return list(db.scalars(statement).unique().all())


def cancel_order(db: Session, user: User, order_id: str, context: RequestContext) -> Order:
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user.id)
        .options(joinedload(Order.stock), joinedload(Order.risk_event))
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.status not in {OrderStatus.PENDING, OrderStatus.ACCEPTED, OrderStatus.HELD}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending, accepted, or held orders can be cancelled",
        )

    order.status = OrderStatus.CANCELLED
    record_audit(
        db=db,
        actor_user_id=user.id,
        event_type="ORDER_CANCELLED",
        target_type="ORDER",
        target_id=order.id,
        context=context,
        payload={"symbol": order.stock.symbol, "status": order.status.value},
    )
    db.flush()
    return order

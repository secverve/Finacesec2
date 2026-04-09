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
from app.services.market_data import market_data_provider
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


def _record_execution_audit(db: Session, user: User, order: Order, stock: Stock, context: RequestContext) -> None:
    if order.status != OrderStatus.EXECUTED:
        return

    record_audit(
        db=db,
        actor_user_id=user.id,
        event_type="ORDER_EXECUTED",
        target_type="ORDER",
        target_id=order.id,
        context=context,
        payload={
            "symbol": stock.symbol,
            "quantity": order.executed_quantity,
            "executed_price": str(order.executed_price) if order.executed_price is not None else None,
            "status": order.status.value,
            "remaining_quantity": max(order.quantity - order.executed_quantity, 0),
        },
    )


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
        metadata_json={"submitted_via": "api", "request_id": context.request_id},
    )
    db.add(order)
    db.flush()

    risk_event, evaluation = evaluate_and_persist_order_risk(db, user, stock, order, context)
    if evaluation.decision == RiskDecision.BLOCKED:
        order.status = OrderStatus.BLOCKED
    elif evaluation.decision == RiskDecision.HELD:
        order.status = OrderStatus.HELD
    else:
        execute_order_if_possible(db, order, stock, account, execution_source="order_submit")

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
            "order_type": order.order_type.value,
            "side": order.side.value,
        },
    )
    _record_execution_audit(db, user, order, stock, context)
    db.flush()
    return order


def sync_open_orders_for_user(db: Session, user: User, context: RequestContext) -> int:
    statement = (
        select(Order)
        .where(Order.user_id == user.id, Order.status.in_([OrderStatus.PENDING, OrderStatus.ACCEPTED]))
        .options(joinedload(Order.stock), joinedload(Order.account), joinedload(Order.executions))
        .order_by(Order.created_at.asc())
    )
    open_orders = list(db.scalars(statement).unique().all())
    if not open_orders:
        return 0

    executed_count = 0
    quote_cache: dict[str, dict] = {}

    for order in open_orders:
        stock = order.stock
        if stock.symbol not in quote_cache:
            quote_cache[stock.symbol] = market_data_provider.get_quote(db, stock.symbol)
        previous_status = order.status
        execute_order_if_possible(
            db,
            order,
            stock,
            order.account,
            raise_on_rejection=False,
            execution_source="market_refresh",
        )
        if previous_status != OrderStatus.EXECUTED and order.status == OrderStatus.EXECUTED:
            executed_count += 1
            _record_execution_audit(db, user, order, stock, context)

    db.flush()
    return executed_count


def list_orders(db: Session, user: User) -> list[Order]:
    statement = (
        select(Order)
        .where(Order.user_id == user.id)
        .options(joinedload(Order.stock), joinedload(Order.risk_event), joinedload(Order.executions))
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
    order.metadata_json = {
        **(order.metadata_json or {}),
        "execution_state": "CANCELLED",
        "remaining_quantity": max(order.quantity - order.executed_quantity, 0),
    }
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

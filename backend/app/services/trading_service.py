from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import OrderSide, OrderStatus, OrderType
from app.models.account import Account
from app.models.execution import Execution
from app.models.order import Order
from app.models.stock import Stock
from app.services.portfolio_service import get_position_quantity


def _tick_size(price: Decimal) -> Decimal:
    amount = Decimal(price)
    if amount >= Decimal("500000"):
        return Decimal("1000")
    if amount >= Decimal("100000"):
        return Decimal("500")
    if amount >= Decimal("50000"):
        return Decimal("100")
    if amount >= Decimal("10000"):
        return Decimal("50")
    return Decimal("10")


def _market_execution_price(order: Order, stock: Stock) -> Decimal:
    current_price = Decimal(str(stock.current_price))
    tick = _tick_size(current_price)
    notional = current_price * Decimal(order.quantity)
    settings = get_settings()
    slippage_ticks = 2 if notional >= Decimal(str(settings.high_amount_threshold)) else 1
    offset = tick * slippage_ticks

    if order.side == OrderSide.BUY:
        return current_price + offset
    return max(current_price - offset, tick)


def resolve_execution_price(order: Order, stock: Stock) -> Decimal | None:
    current_price = Decimal(str(stock.current_price))
    if order.order_type == OrderType.MARKET:
        return _market_execution_price(order, stock)
    if order.side == OrderSide.BUY and order.price is not None and Decimal(str(order.price)) >= current_price:
        return current_price
    if order.side == OrderSide.SELL and order.price is not None and Decimal(str(order.price)) <= current_price:
        return current_price
    return None


def execute_order_if_possible(
    db: Session,
    order: Order,
    stock: Stock,
    account: Account,
    *,
    raise_on_rejection: bool = True,
    execution_source: str = "order_submit",
) -> Order:
    execution_price = resolve_execution_price(order, stock)
    if execution_price is None:
        order.status = OrderStatus.ACCEPTED
        order.metadata_json = {
            **(order.metadata_json or {}),
            "execution_state": "WAITING_MARKET",
            "execution_source": execution_source,
            "remaining_quantity": order.quantity - order.executed_quantity,
        }
        return order

    total_amount = execution_price * Decimal(order.quantity)
    if order.side == OrderSide.BUY:
        if Decimal(str(account.cash_balance)) < total_amount:
            order.status = OrderStatus.REJECTED
            order.metadata_json = {
                **(order.metadata_json or {}),
                "execution_state": "REJECTED",
                "reject_reason": "INSUFFICIENT_CASH",
                "execution_source": execution_source,
            }
            if raise_on_rejection:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Insufficient cash balance",
                )
            return order
        account.cash_balance = Decimal(str(account.cash_balance)) - total_amount
    else:
        available_quantity = get_position_quantity(db, order.user_id, stock.id)
        if available_quantity < order.quantity:
            order.status = OrderStatus.REJECTED
            order.metadata_json = {
                **(order.metadata_json or {}),
                "execution_state": "REJECTED",
                "reject_reason": "INSUFFICIENT_HOLDINGS",
                "execution_source": execution_source,
            }
            if raise_on_rejection:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Insufficient holdings",
                )
            return order
        account.cash_balance = Decimal(str(account.cash_balance)) + total_amount

    execution = Execution(
        order_id=order.id,
        stock_id=stock.id,
        quantity=order.quantity,
        price=execution_price,
    )
    db.add(execution)
    order.executed_price = execution_price
    order.executed_quantity = order.quantity
    order.status = OrderStatus.EXECUTED
    order.metadata_json = {
        **(order.metadata_json or {}),
        "execution_state": "FILLED",
        "execution_source": execution_source,
        "remaining_quantity": 0,
    }
    db.flush()
    return order

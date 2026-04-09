from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import OrderSide, OrderStatus, OrderType
from app.models.account import Account
from app.models.execution import Execution
from app.models.order import Order
from app.models.stock import Stock
from app.services.portfolio_service import get_position_quantity


def resolve_execution_price(order: Order, stock: Stock) -> Decimal | None:
    current_price = Decimal(str(stock.current_price))
    if order.order_type == OrderType.MARKET:
        return current_price
    if order.side == OrderSide.BUY and order.price is not None and Decimal(str(order.price)) >= current_price:
        return current_price
    if order.side == OrderSide.SELL and order.price is not None and Decimal(str(order.price)) <= current_price:
        return current_price
    return None


def execute_order_if_possible(db: Session, order: Order, stock: Stock, account: Account) -> Order:
    execution_price = resolve_execution_price(order, stock)
    if execution_price is None:
        order.status = OrderStatus.ACCEPTED
        return order

    total_amount = execution_price * Decimal(order.quantity)
    if order.side == OrderSide.BUY:
        if Decimal(str(account.cash_balance)) < total_amount:
            order.status = OrderStatus.REJECTED
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient cash balance",
            )
        account.cash_balance = Decimal(str(account.cash_balance)) - total_amount
    else:
        available_quantity = get_position_quantity(db, order.user_id, stock.id)
        if available_quantity < order.quantity:
            order.status = OrderStatus.REJECTED
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient holdings",
            )
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
    db.flush()
    return order

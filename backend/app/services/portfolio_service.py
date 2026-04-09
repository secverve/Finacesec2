from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import OrderSide
from app.models.execution import Execution
from app.models.order import Order
from app.models.stock import Stock
from app.models.user import User
from app.services.market_data import market_data_provider


def get_position_quantity(db: Session, user_id: str, stock_id: str) -> int:
    rows = db.execute(
        select(Execution, Order)
        .join(Order, Execution.order_id == Order.id)
        .where(Order.user_id == user_id, Execution.stock_id == stock_id)
    ).all()
    quantity = 0
    for execution, order in rows:
        quantity += execution.quantity if order.side == OrderSide.BUY else -execution.quantity
    return quantity


def build_portfolio(db: Session, user: User) -> dict:
    account = user.account
    rows = db.execute(
        select(Execution, Order, Stock)
        .join(Order, Execution.order_id == Order.id)
        .join(Stock, Execution.stock_id == Stock.id)
        .where(Order.user_id == user.id)
    ).all()

    grouped: dict[str, dict] = defaultdict(
        lambda: {
            "symbol": "",
            "name": "",
            "quantity": 0,
            "buy_quantity": 0,
            "buy_cost": Decimal("0"),
        }
    )

    for execution, order, stock in rows:
        item = grouped[stock.symbol]
        item["symbol"] = stock.symbol
        item["name"] = stock.name
        if order.side == OrderSide.BUY:
            item["quantity"] += execution.quantity
            item["buy_quantity"] += execution.quantity
            item["buy_cost"] += Decimal(str(execution.price)) * execution.quantity
        else:
            item["quantity"] -= execution.quantity

    holdings = []
    total_market_value = Decimal("0")
    for symbol, item in grouped.items():
        if item["quantity"] <= 0:
            continue
        quote = market_data_provider.get_quote(db, symbol)
        current_price = Decimal(str(quote["price"]))
        average_price = item["buy_cost"] / item["buy_quantity"] if item["buy_quantity"] else Decimal("0")
        market_value = current_price * item["quantity"]
        unrealized_pnl = (current_price - average_price) * item["quantity"]
        total_market_value += market_value
        holdings.append(
            {
                "symbol": symbol,
                "name": item["name"],
                "quantity": item["quantity"],
                "average_price": average_price.quantize(Decimal("0.01")),
                "current_price": current_price.quantize(Decimal("0.01")),
                "market_value": market_value.quantize(Decimal("0.01")),
                "unrealized_pnl": unrealized_pnl.quantize(Decimal("0.01")),
            }
        )

    total_cash = Decimal(str(account.cash_balance))
    return {
        "account": account,
        "holdings": holdings,
        "total_asset_value": (total_cash + total_market_value).quantize(Decimal("0.01")),
        "total_cash": total_cash.quantize(Decimal("0.01")),
    }


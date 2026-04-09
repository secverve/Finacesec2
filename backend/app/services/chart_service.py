from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.stock import Stock
from app.services.live_market_data import fetch_live_daily_rows, fetch_live_intraday_rows

SUPPORTED_CANDLE_INTERVALS = {
    "1m": {"step": timedelta(minutes=1), "default_limit": 60},
    "3m": {"step": timedelta(minutes=3), "default_limit": 60},
    "5m": {"step": timedelta(minutes=5), "default_limit": 60},
    "10m": {"step": timedelta(minutes=10), "default_limit": 60},
    "1d": {"step": timedelta(days=1), "default_limit": 60},
}


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


def _align_timestamp(now: datetime, interval: str) -> datetime:
    if interval == "1d":
        return now.replace(hour=15, minute=30, second=0, microsecond=0)

    minutes = int(interval.removesuffix("m"))
    aligned_minute = (now.minute // minutes) * minutes
    return now.replace(minute=aligned_minute, second=0, microsecond=0)


def _build_deterministic_candles(db: Session, stock: Stock, interval: str, limit: int) -> list[dict]:
    config = SUPPORTED_CANDLE_INTERVALS[interval]
    step = config["step"]
    now = datetime.now(UTC)
    anchor = _align_timestamp(now, interval)
    current_price = Decimal(str(stock.current_price))
    tick = _tick_size(current_price)
    seed = sum(ord(character) for character in stock.symbol)
    order_count = db.query(Order).filter(Order.stock_id == stock.id).count()

    candles: list[dict] = []
    previous_close = current_price - Decimal((seed % 5) - 2) * tick
    previous_close = previous_close if previous_close > tick else tick

    for index in range(limit):
        timestamp = anchor - (step * (limit - index - 1))
        open_price = previous_close + Decimal(((seed + index * 3) % 7) - 3) * tick
        open_price = open_price if open_price > tick else tick
        close_price = open_price + Decimal(((seed + index * 5) % 9) - 4) * tick
        close_price = close_price if close_price > tick else tick
        high_price = max(open_price, close_price) + Decimal(((seed + index) % 4) + 1) * tick
        low_price = min(open_price, close_price) - Decimal(((seed + index * 2) % 4) + 1) * tick
        low_price = low_price if low_price > tick else tick
        volume = 700 + ((seed * (index + 1) * 17) % 14000) + (order_count * 9)

        candles.append(
            {
                "timestamp": timestamp,
                "open": open_price.quantize(Decimal("1")),
                "high": high_price.quantize(Decimal("1")),
                "low": low_price.quantize(Decimal("1")),
                "close": close_price.quantize(Decimal("1")),
                "volume": volume,
            }
        )
        previous_close = close_price

    last_candle = candles[-1]
    last_candle["close"] = current_price.quantize(Decimal("1"))
    last_candle["high"] = max(last_candle["high"], last_candle["open"], last_candle["close"])
    last_candle["low"] = min(last_candle["low"], last_candle["open"], last_candle["close"])
    return candles


def get_candles(db: Session, symbol: str, interval: str = "1m", limit: int | None = None) -> list[dict]:
    stock = db.scalar(select(Stock).where(Stock.symbol == symbol.upper()))
    if stock is None:
        raise ValueError("Stock not found")

    if interval not in SUPPORTED_CANDLE_INTERVALS:
        raise ValueError("Unsupported interval")

    config = SUPPORTED_CANDLE_INTERVALS[interval]
    candle_limit = max(10, min(limit or config["default_limit"], 240))

    try:
        if interval == "1d":
            candles = fetch_live_daily_rows(stock)
        else:
            candles = fetch_live_intraday_rows(stock, minutes=int(interval.removesuffix("m")))
        if candles:
            return candles[-candle_limit:]
    except Exception:
        pass

    return _build_deterministic_candles(db, stock, interval=interval, limit=candle_limit)

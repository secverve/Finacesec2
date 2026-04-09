from datetime import datetime
from decimal import Decimal

from pydantic import ConfigDict

from app.schemas.common import ORMBaseModel


class StockResponse(ORMBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    symbol: str
    name: str
    market: str
    current_price: Decimal
    is_watchlist: bool
    previous_close: Decimal | None = None
    open: Decimal | None = None
    day_high: Decimal | None = None
    day_low: Decimal | None = None
    volume: int | None = None


class QuoteResponse(ORMBaseModel):
    symbol: str
    name: str
    price: Decimal
    market: str
    is_watchlist: bool
    previous_close: Decimal | None = None
    open: Decimal | None = None
    day_high: Decimal | None = None
    day_low: Decimal | None = None
    volume: int | None = None


class CandleResponse(ORMBaseModel):
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int

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


class QuoteResponse(ORMBaseModel):
    symbol: str
    name: str
    price: Decimal
    market: str
    is_watchlist: bool


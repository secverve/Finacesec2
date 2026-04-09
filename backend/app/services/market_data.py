import json
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cache import get_redis_client
from app.models.stock import Stock


class MarketDataProvider(Protocol):
    def list_stocks(self, db: Session) -> list[Stock]: ...
    def get_quote(self, db: Session, symbol: str) -> dict: ...


class MockMarketDataProvider:
    def __init__(self) -> None:
        self.redis_client = get_redis_client()

    def list_stocks(self, db: Session) -> list[Stock]:
        return list(db.scalars(select(Stock).order_by(Stock.symbol.asc())).all())

    def get_quote(self, db: Session, symbol: str) -> dict:
        cache_key = f"quote:{symbol.upper()}"
        if self.redis_client:
            cached = self.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

        stock = db.scalar(select(Stock).where(Stock.symbol == symbol.upper()))
        if stock is None:
            raise ValueError("Stock not found")

        quote = {
            "symbol": stock.symbol,
            "name": stock.name,
            "price": str(stock.current_price),
            "market": stock.market,
            "is_watchlist": stock.is_watchlist,
        }
        if self.redis_client:
            self.redis_client.setex(cache_key, 10, json.dumps(quote))
        return quote


market_data_provider = MockMarketDataProvider()


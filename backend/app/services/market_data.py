import json
from decimal import Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cache import get_redis_client
from app.models.stock import Stock
from app.services.live_market_data import fetch_live_quote


class MarketDataProvider(Protocol):
    def list_stocks(self, db: Session) -> list[dict]: ...
    def get_quote(self, db: Session, symbol: str) -> dict: ...


class HybridMarketDataProvider:
    def __init__(self) -> None:
        self.redis_client = get_redis_client()

    def list_stocks(self, db: Session) -> list[dict]:
        stocks = list(db.scalars(select(Stock).order_by(Stock.symbol.asc())).all())
        return [self._build_quote(db, stock) for stock in stocks]

    def get_quote(self, db: Session, symbol: str) -> dict:
        stock = db.scalar(select(Stock).where(Stock.symbol == symbol.upper()))
        if stock is None:
            raise ValueError("Stock not found")
        return self._build_quote(db, stock)

    def _build_quote(self, db: Session, stock: Stock) -> dict:
        cache_key = f"quote:{stock.symbol.upper()}"
        if self.redis_client:
            cached = self.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

        quote = {
            "id": stock.id,
            "symbol": stock.symbol,
            "name": stock.name,
            "market": stock.market,
            "current_price": str(stock.current_price),
            "is_watchlist": stock.is_watchlist,
            "previous_close": None,
            "open": None,
            "day_high": None,
            "day_low": None,
            "volume": None,
        }

        try:
            live_quote = fetch_live_quote(stock)
            quote["price"] = live_quote["price"]
            quote["current_price"] = live_quote["price"]
            quote["previous_close"] = live_quote["previous_close"]
            quote["open"] = live_quote["open"]
            quote["day_high"] = live_quote["day_high"]
            quote["day_low"] = live_quote["day_low"]
            quote["volume"] = live_quote["volume"]
            stock.current_price = Decimal(live_quote["price"])
            db.flush()
        except Exception:
            quote["price"] = str(stock.current_price)

        if self.redis_client:
            self.redis_client.setex(cache_key, 5, json.dumps(quote))
        return quote


market_data_provider = HybridMarketDataProvider()

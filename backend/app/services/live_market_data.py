import json
import time
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.models.stock import Stock

_CACHE: dict[str, tuple[float, dict]] = {}
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"


def _cache_get(key: str, ttl_seconds: int) -> dict | None:
    cached = _CACHE.get(key)
    if cached is None:
        return None
    stored_at, payload = cached
    if (time.time() - stored_at) > ttl_seconds:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict) -> None:
    _CACHE[key] = (time.time(), payload)


def _yahoo_symbol(stock: Stock) -> str:
    market = (stock.market or "").upper()
    if market == "KOSDAQ":
        return f"{stock.symbol}.KQ"
    if market == "KOSPI":
        return f"{stock.symbol}.KS"
    return stock.symbol


def _load_json(url: str, ttl_seconds: int = 5) -> dict:
    cached = _cache_get(url, ttl_seconds)
    if cached is not None:
        return cached

    request = Request(url, headers={"User-Agent": _USER_AGENT})
    with urlopen(request, timeout=15) as response:
        payload = json.load(response)
    _cache_set(url, payload)
    return payload


def _last_non_null(values: list) -> float | int | None:
    for value in reversed(values):
        if value is not None:
            return value
    return None


def _parse_chart_payload(payload: dict) -> dict:
    results = payload.get("chart", {}).get("result") or []
    if not results:
        raise ValueError("Live quote unavailable")
    return results[0]


def fetch_live_quote(stock: Stock) -> dict:
    symbol = _yahoo_symbol(stock)
    query = urlencode({"interval": "1m", "range": "1d", "includePrePost": "false"})
    payload = _load_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?{query}", ttl_seconds=5)
    chart = _parse_chart_payload(payload)
    meta = chart.get("meta", {})
    quote = (chart.get("indicators", {}).get("quote") or [{}])[0]
    close_value = meta.get("regularMarketPrice") or _last_non_null(quote.get("close") or [])
    previous_close = meta.get("chartPreviousClose") or meta.get("previousClose") or close_value
    open_value = meta.get("regularMarketOpen") or _last_non_null(quote.get("open") or []) or close_value
    high_value = meta.get("regularMarketDayHigh") or _last_non_null(quote.get("high") or []) or close_value
    low_value = meta.get("regularMarketDayLow") or _last_non_null(quote.get("low") or []) or close_value
    volume = _last_non_null(quote.get("volume") or []) or 0

    if close_value is None:
        raise ValueError("Live quote unavailable")

    return {
        "symbol": stock.symbol,
        "name": stock.name,
        "price": str(Decimal(str(close_value)).quantize(Decimal("1"))),
        "market": stock.market,
        "is_watchlist": stock.is_watchlist,
        "previous_close": str(Decimal(str(previous_close)).quantize(Decimal("1"))),
        "open": str(Decimal(str(open_value)).quantize(Decimal("1"))),
        "day_high": str(Decimal(str(high_value)).quantize(Decimal("1"))),
        "day_low": str(Decimal(str(low_value)).quantize(Decimal("1"))),
        "volume": int(volume),
    }


def fetch_live_intraday_rows(stock: Stock, minutes: int = 1) -> list[dict]:
    symbol = _yahoo_symbol(stock)
    query = urlencode({"interval": "1m", "range": "5d", "includePrePost": "false"})
    payload = _load_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?{query}", ttl_seconds=10)
    chart = _parse_chart_payload(payload)
    timestamps = chart.get("timestamp") or []
    quote = (chart.get("indicators", {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    rows: list[dict] = []
    for timestamp, open_value, high_value, low_value, close_value, volume in zip(
        timestamps, opens, highs, lows, closes, volumes, strict=False
    ):
        if None in (open_value, high_value, low_value, close_value):
            continue
        rows.append(
            {
                "timestamp": datetime.fromtimestamp(timestamp, tz=UTC),
                "open": Decimal(str(open_value)).quantize(Decimal("1")),
                "high": Decimal(str(high_value)).quantize(Decimal("1")),
                "low": Decimal(str(low_value)).quantize(Decimal("1")),
                "close": Decimal(str(close_value)).quantize(Decimal("1")),
                "volume": int(volume or 0),
            }
        )

    if minutes <= 1:
        return rows

    buckets: list[dict] = []
    bucket_size = minutes * 60
    current_bucket: dict | None = None
    current_bucket_key: int | None = None

    for row in rows:
        bucket_key = int(row["timestamp"].timestamp()) // bucket_size
        if current_bucket is None or current_bucket_key != bucket_key:
            if current_bucket is not None:
                buckets.append(current_bucket)
            current_bucket_key = bucket_key
            current_bucket = dict(row)
            continue

        current_bucket["high"] = max(current_bucket["high"], row["high"])
        current_bucket["low"] = min(current_bucket["low"], row["low"])
        current_bucket["close"] = row["close"]
        current_bucket["volume"] += row["volume"]

    if current_bucket is not None:
        buckets.append(current_bucket)

    return buckets


def fetch_live_daily_rows(stock: Stock) -> list[dict]:
    symbol = _yahoo_symbol(stock)
    query = urlencode({"interval": "1d", "range": "6mo", "includePrePost": "false"})
    payload = _load_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?{query}", ttl_seconds=60)
    chart = _parse_chart_payload(payload)
    timestamps = chart.get("timestamp") or []
    quote = (chart.get("indicators", {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    rows: list[dict] = []
    for timestamp, open_value, high_value, low_value, close_value, volume in zip(
        timestamps, opens, highs, lows, closes, volumes, strict=False
    ):
        if None in (open_value, high_value, low_value, close_value):
            continue
        rows.append(
            {
                "timestamp": datetime.fromtimestamp(timestamp, tz=UTC),
                "open": Decimal(str(open_value)).quantize(Decimal("1")),
                "high": Decimal(str(high_value)).quantize(Decimal("1")),
                "low": Decimal(str(low_value)).quantize(Decimal("1")),
                "close": Decimal(str(close_value)).quantize(Decimal("1")),
                "volume": int(volume or 0),
            }
        )

    return rows

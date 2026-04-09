from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.market import CandleResponse, QuoteResponse, StockResponse
from app.services.chart_service import get_candles
from app.services.market_data import market_data_provider

router = APIRouter()


@router.get("/stocks", response_model=list[StockResponse])
def list_stocks(db: Annotated[Session, Depends(get_db)]) -> list:
    return market_data_provider.list_stocks(db)


@router.get("/quote/{symbol}", response_model=QuoteResponse)
def get_quote(symbol: str, db: Annotated[Session, Depends(get_db)]) -> QuoteResponse:
    try:
        quote = market_data_provider.get_quote(db, symbol)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return QuoteResponse(**quote)


@router.get("/candles/{symbol}", response_model=list[CandleResponse])
def candles(
    symbol: str,
    interval: Literal["1m", "3m", "5m", "10m", "1d"] = "1m",
    limit: int = 60,
    db: Annotated[Session, Depends(get_db)] = None,
) -> list[CandleResponse]:
    try:
        return [CandleResponse(**candle) for candle in get_candles(db, symbol, interval=interval, limit=limit)]
    except ValueError as exc:
        error_code = status.HTTP_400_BAD_REQUEST if "interval" in str(exc).lower() else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=error_code, detail=str(exc)) from exc

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.market import QuoteResponse, StockResponse
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


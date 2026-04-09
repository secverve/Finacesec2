from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.account import PortfolioResponse
from app.services.portfolio_service import build_portfolio

router = APIRouter()


@router.get("/me", response_model=PortfolioResponse)
def my_portfolio(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    return build_portfolio(db, current_user)


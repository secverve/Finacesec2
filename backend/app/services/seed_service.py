from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import UserRole
from app.models.stock import Stock
from app.services.auth_service import create_user_with_account

SEED_STOCKS = [
    {"symbol": "005930", "name": "Samsung Electronics", "market": "KOSPI", "price": "83200.00", "watchlist": False},
    {"symbol": "000660", "name": "SK Hynix", "market": "KOSPI", "price": "187500.00", "watchlist": False},
    {"symbol": "035420", "name": "NAVER", "market": "KOSPI", "price": "178300.00", "watchlist": True},
    {"symbol": "035720", "name": "Kakao", "market": "KOSPI", "price": "41200.00", "watchlist": False},
    {"symbol": "051910", "name": "LG Chem", "market": "KOSPI", "price": "348000.00", "watchlist": True},
]


def seed_stocks(db: Session) -> None:
    existing_symbols = set(db.scalars(select(Stock.symbol)).all())
    for item in SEED_STOCKS:
        if item["symbol"] in existing_symbols:
            continue
        db.add(
            Stock(
                symbol=item["symbol"],
                name=item["name"],
                market=item["market"],
                current_price=Decimal(item["price"]),
                is_watchlist=item["watchlist"],
            )
        )


def seed_initial_data(db: Session) -> None:
    settings = get_settings()
    create_user_with_account(
        db=db,
        email=settings.admin_email,
        full_name="VERVE Admin",
        password=settings.admin_password,
        role=UserRole.ADMIN,
        opening_balance=0,
    )
    create_user_with_account(
        db=db,
        email=settings.demo_user_email,
        full_name="Demo Trader",
        password=settings.demo_user_password,
        role=UserRole.USER,
        opening_balance=100_000_000,
    )
    create_user_with_account(
        db=db,
        email=settings.second_user_email,
        full_name="Risk Analyst",
        password=settings.second_user_password,
        role=UserRole.USER,
        opening_balance=80_000_000,
    )
    seed_stocks(db)

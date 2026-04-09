from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Stock(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stocks"

    symbol: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    market: Mapped[str] = mapped_column(String(20))
    current_price: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    is_watchlist: Mapped[bool] = mapped_column(Boolean, default=False)

    orders = relationship("Order", back_populates="stock")
    executions = relationship("Execution", back_populates="stock")


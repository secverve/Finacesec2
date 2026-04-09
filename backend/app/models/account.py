from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Account(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounts"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    account_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    locked_cash: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

    user = relationship("User", back_populates="account")
    orders = relationship("Order", back_populates="account")


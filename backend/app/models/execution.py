from decimal import Decimal
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Execution(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "executions"

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    stock_id: Mapped[str] = mapped_column(ForeignKey("stocks.id"), index=True)
    quantity: Mapped[int] = mapped_column()
    price: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    order = relationship("Order", back_populates="executions")
    stock = relationship("Stock", back_populates="executions")


from decimal import Decimal

from sqlalchemy import Enum, ForeignKey, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import OrderSide, OrderStatus, OrderType
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    stock_id: Mapped[str] = mapped_column(ForeignKey("stocks.id"), index=True)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide))
    order_type: Mapped[OrderType] = mapped_column(Enum(OrderType))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.PENDING)
    quantity: Mapped[int] = mapped_column()
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    executed_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    executed_quantity: Mapped[int] = mapped_column(default=0)
    fds_score: Mapped[int] = mapped_column(default=0)
    ip_address: Mapped[str] = mapped_column(String(64))
    region: Mapped[str] = mapped_column(String(16))
    device_id: Mapped[str] = mapped_column(String(128))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="orders")
    account = relationship("Account", back_populates="orders")
    stock = relationship("Stock", back_populates="orders")
    executions = relationship("Execution", back_populates="order")
    risk_event = relationship("RiskEvent", back_populates="order", uselist=False)

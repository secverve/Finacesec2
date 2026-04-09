from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserBehaviorProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_behavior_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    average_order_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    average_order_count_per_hour: Mapped[int] = mapped_column(default=0)
    average_cancel_ratio: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=0)
    recent_login_failures: Mapped[int] = mapped_column(default=0)
    last_login_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_login_region: Mapped[str | None] = mapped_column(String(16), nullable=True)

    user = relationship("User", back_populates="behavior_profile")


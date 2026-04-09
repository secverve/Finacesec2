from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserRole, UserStatus
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE)

    account = relationship("Account", back_populates="user", uselist=False)
    orders = relationship("Order", back_populates="user")
    logins = relationship("LoginHistory", back_populates="user")
    devices = relationship("DeviceHistory", back_populates="user")
    security_devices = relationship("SecurityDevice", back_populates="user")
    auth_sessions = relationship("AuthSession", back_populates="user")
    risk_events = relationship("RiskEvent", back_populates="user")
    admin_actions = relationship("AdminAction", back_populates="admin_user")
    behavior_profile = relationship("UserBehaviorProfile", back_populates="user", uselist=False)

from enum import Enum


class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"


class DeviceTrustStatus(str, Enum):
    TRUSTED = "TRUSTED"
    WATCH = "WATCH"
    STEP_UP_REQUIRED = "STEP_UP_REQUIRED"
    BLOCKED = "BLOCKED"


class SessionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


class AuthStrength(str, Enum):
    PASSWORD_ONLY = "PASSWORD_ONLY"
    PASSWORD_PLUS_DEVICE = "PASSWORD_PLUS_DEVICE"
    STEP_UP_REQUIRED = "STEP_UP_REQUIRED"
    ADMIN_APPROVED = "ADMIN_APPROVED"


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    HELD = "HELD"
    BLOCKED = "BLOCKED"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class RiskSeverity(str, Enum):
    NORMAL = "NORMAL"
    CAUTION = "CAUTION"
    SUSPICIOUS = "SUSPICIOUS"
    CRITICAL = "CRITICAL"


class RiskDecision(str, Enum):
    ALLOW = "ALLOW"
    HELD = "HELD"
    BLOCKED = "BLOCKED"
    AUTH_REQUIRED = "AUTH_REQUIRED"


class RiskEventStatus(str, Enum):
    AUTO_ALLOWED = "AUTO_ALLOWED"
    OPEN = "OPEN"
    APPROVED = "APPROVED"
    BLOCKED = "BLOCKED"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    RESOLVED = "RESOLVED"


class AdminActionType(str, Enum):
    APPROVE = "APPROVE"
    BLOCK = "BLOCK"
    REQUEST_ADDITIONAL_AUTH = "REQUEST_ADDITIONAL_AUTH"
    LOCK_ACCOUNT = "LOCK_ACCOUNT"
    UNLOCK_ACCOUNT = "UNLOCK_ACCOUNT"


class DeviceActionType(str, Enum):
    TRUST = "TRUST"
    STEP_UP = "STEP_UP"
    BLOCK = "BLOCK"


class AdditionalAuthStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"

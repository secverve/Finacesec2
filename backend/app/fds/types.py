from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

from app.core.enums import RiskSeverity
from app.models.account import Account
from app.models.device_history import DeviceHistory
from app.models.login_history import LoginHistory
from app.models.order import Order
from app.models.stock import Stock
from app.models.user import User
from app.models.user_behavior_profile import UserBehaviorProfile


@dataclass(slots=True)
class RequestContext:
    ip_address: str
    region: str
    device_id: str


@dataclass(slots=True)
class RuleContext:
    user: User
    account: Account
    stock: Stock
    order: Order
    request_context: RequestContext
    order_amount: Decimal
    latest_success_login: LoginHistory | None
    recent_failed_logins: int
    is_new_device: bool
    behavior_profile: UserBehaviorProfile | None
    recent_cancel_or_modify_count: int
    same_ip_peer_orders: int
    known_device: DeviceHistory | None


@dataclass(slots=True)
class RuleHitResult:
    rule_code: str
    rule_name: str
    description: str
    score: int
    severity: RiskSeverity
    reason_template: str
    reason: str


@dataclass(slots=True)
class RuleDefinition:
    rule_code: str
    rule_name: str
    description: str
    score: int
    severity: RiskSeverity
    reason_template: str
    condition: Callable[[RuleContext], bool]


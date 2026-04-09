from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import create_access_token, hash_password, verify_password
from app.fds.types import RequestContext
from app.models.account import Account
from app.models.device_history import DeviceHistory
from app.models.login_history import LoginHistory
from app.models.user import User
from app.models.user_behavior_profile import UserBehaviorProfile
from app.services.audit_service import record_audit


def generate_account_number(seed: int) -> str:
    return f"100-{seed:06d}-01"


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def create_user_with_account(
    db: Session,
    email: str,
    full_name: str,
    password: str,
    role: UserRole,
    opening_balance: int,
) -> User:
    existing_user = get_user_by_email(db, email)
    if existing_user:
        return existing_user

    user_count = db.query(User).count() + 1
    user = User(
        email=email.lower(),
        full_name=full_name,
        password_hash=hash_password(password),
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()

    account = Account(
        user_id=user.id,
        account_number=generate_account_number(user_count),
        cash_balance=opening_balance,
        locked_cash=0,
        status="ACTIVE",
    )
    behavior_profile = UserBehaviorProfile(
        user_id=user.id,
        average_order_amount=250000,
        average_order_count_per_hour=3,
        average_cancel_ratio=0.0500,
        recent_login_failures=0,
    )
    db.add(account)
    db.add(behavior_profile)
    db.flush()
    return user


def register_user(db: Session, email: str, full_name: str, password: str, context: RequestContext) -> User:
    if get_user_by_email(db, email):
        raise ValueError("User already exists")
    user = create_user_with_account(
        db=db,
        email=email,
        full_name=full_name,
        password=password,
        role=UserRole.USER,
        opening_balance=100_000_000,
    )
    record_audit(
        db,
        actor_user_id=user.id,
        event_type="USER_REGISTERED",
        target_type="USER",
        target_id=user.id,
        context=context,
        payload={"email": user.email},
    )
    return user


def authenticate_user(
    db: Session,
    email: str,
    password: str,
    context: RequestContext,
) -> str:
    user = get_user_by_email(db, email)
    login_history = LoginHistory(
        user_id=user.id if user else None,
        email=email.lower(),
        ip_address=context.ip_address,
        region=context.region,
        device_id=context.device_id,
        success=False,
        failure_reason="INVALID_CREDENTIALS",
    )

    if user is None or not verify_password(password, user.password_hash):
        if user and user.behavior_profile:
            user.behavior_profile.recent_login_failures += 1
        db.add(login_history)
        record_audit(
            db,
            actor_user_id=user.id if user else None,
            event_type="LOGIN_FAILED",
            target_type="USER",
            target_id=user.id if user else None,
            context=context,
            payload={"email": email.lower()},
        )
        db.flush()
        raise ValueError("Invalid credentials")

    if user.status == UserStatus.LOCKED:
        login_history.failure_reason = "ACCOUNT_LOCKED"
        db.add(login_history)
        record_audit(
            db,
            actor_user_id=user.id,
            event_type="LOGIN_BLOCKED",
            target_type="USER",
            target_id=user.id,
            context=context,
            payload={"reason": "ACCOUNT_LOCKED"},
        )
        db.flush()
        raise PermissionError("Account is locked")

    login_history.success = True
    login_history.failure_reason = None
    db.add(login_history)

    if user.behavior_profile:
        user.behavior_profile.recent_login_failures = 0
        user.behavior_profile.last_login_ip = context.ip_address
        user.behavior_profile.last_login_region = context.region

    existing_device = db.scalar(
        select(DeviceHistory).where(
            DeviceHistory.user_id == user.id,
            DeviceHistory.device_id == context.device_id,
        )
    )
    if existing_device is None:
        db.add(
            DeviceHistory(
                user_id=user.id,
                device_id=context.device_id,
                ip_address=context.ip_address,
                region=context.region,
            )
        )
    else:
        existing_device.ip_address = context.ip_address
        existing_device.region = context.region

    record_audit(
        db,
        actor_user_id=user.id,
        event_type="LOGIN_SUCCEEDED",
        target_type="USER",
        target_id=user.id,
        context=context,
        payload={"email": user.email},
    )
    db.flush()
    return create_access_token(user.id)


def logout_user(db: Session, user: User, context: RequestContext) -> None:
    record_audit(
        db,
        actor_user_id=user.id,
        event_type="LOGOUT",
        target_type="USER",
        target_id=user.id,
        context=context,
        payload={"email": user.email},
    )
    db.flush()


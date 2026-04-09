from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import DeviceTrustStatus, SessionStatus, UserRole, UserStatus
from app.core.security import create_access_token, hash_password, verify_password
from app.fds.types import RequestContext
from app.models.account import Account
from app.models.auth_session import AuthSession
from app.models.device_history import DeviceHistory
from app.models.login_history import LoginHistory
from app.models.user import User
from app.models.user_behavior_profile import UserBehaviorProfile
from app.services.audit_service import record_audit
from app.services.security_service import create_authenticated_session, revoke_session, upsert_security_device


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


def _record_failed_login(db: Session, user: User | None, email: str, context: RequestContext, reason: str) -> None:
    login_history = LoginHistory(
        user_id=user.id if user else None,
        email=email.lower(),
        ip_address=context.ip_address,
        region=context.region,
        device_id=context.device_id,
        success=False,
        failure_reason=reason,
    )
    db.add(login_history)
    record_audit(
        db,
        actor_user_id=user.id if user else None,
        event_type="LOGIN_FAILED" if reason != "ACCOUNT_LOCKED" else "LOGIN_BLOCKED",
        target_type="USER",
        target_id=user.id if user else None,
        context=context,
        payload={"email": email.lower(), "reason": reason},
    )


def authenticate_user(
    db: Session,
    email: str,
    password: str,
    context: RequestContext,
) -> str:
    settings = get_settings()
    user = get_user_by_email(db, email)

    if user is None or not verify_password(password, user.password_hash):
        if user and user.behavior_profile:
            user.behavior_profile.recent_login_failures += 1
            if user.behavior_profile.recent_login_failures >= settings.login_failure_lock_threshold:
                user.status = UserStatus.LOCKED
                _record_failed_login(db, user, email, context, "ACCOUNT_LOCKED")
                db.flush()
                raise PermissionError("Account is locked")
        _record_failed_login(db, user, email, context, "INVALID_CREDENTIALS")
        db.flush()
        raise ValueError("Invalid credentials")

    if user.status == UserStatus.LOCKED:
        _record_failed_login(db, user, email, context, "ACCOUNT_LOCKED")
        db.flush()
        raise PermissionError("Account is locked")

    login_history = LoginHistory(
        user_id=user.id,
        email=email.lower(),
        ip_address=context.ip_address,
        region=context.region,
        device_id=context.device_id,
        success=True,
        failure_reason=None,
    )
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

    security_device = upsert_security_device(db, user, context)
    if security_device.trust_status == DeviceTrustStatus.BLOCKED:
        _record_failed_login(db, user, email, context, "BLOCKED_DEVICE")
        db.flush()
        raise PermissionError("Blocked device")

    auth_session = create_authenticated_session(db, user, security_device, context)
    record_audit(
        db,
        actor_user_id=user.id,
        event_type="LOGIN_SUCCEEDED",
        target_type="USER",
        target_id=user.id,
        context=context,
        payload={
            "email": user.email,
            "session_id": auth_session.id,
            "device_trust_status": security_device.trust_status.value,
            "session_auth_strength": auth_session.auth_strength.value,
            "session_risk_score": auth_session.risk_score,
        },
    )
    db.flush()
    return create_access_token(user.id, auth_session.id)


def logout_user(db: Session, user: User, context: RequestContext, current_session: AuthSession | None = None) -> None:
    if current_session is not None and current_session.user_id == user.id and current_session.status == SessionStatus.ACTIVE:
        revoke_session(current_session, "USER_LOGOUT")
    record_audit(
        db=db,
        actor_user_id=user.id,
        event_type="LOGOUT",
        target_type="USER",
        target_id=user.id,
        context=context,
        payload={
            "email": user.email,
            "session_id": current_session.id if current_session else None,
        },
    )
    db.flush()

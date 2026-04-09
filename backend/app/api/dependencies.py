from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.enums import SessionStatus, UserRole
from app.core.security import decode_token
from app.db.session import get_db
from app.fds.types import RequestContext
from app.models.auth_session import AuthSession
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def _utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _client_ip_from_request(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    return forwarded_for.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def get_request_context(request: Request) -> RequestContext:
    region = request.headers.get("x-region", "KR").upper()
    device_id = request.headers.get("x-device-id", "web-client")
    request_id = request.headers.get("x-request-id") or getattr(request.state, "request_id", "") or str(uuid4())
    channel = request.headers.get("x-client-channel", "web").lower()
    user_agent = request.headers.get("user-agent", "")
    return RequestContext(
        ip_address=_client_ip_from_request(request),
        region=region,
        device_id=device_id,
        request_id=request_id,
        channel=channel,
        user_agent=user_agent,
    )


def _validate_session(
    db: Session,
    request: Request,
    user: User,
    payload: dict,
) -> AuthSession | None:
    session_id = payload.get("sid")
    if not session_id:
        return None

    session = db.get(AuthSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found")

    now = _utc_now_naive()
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is not active")
    if session.expires_at <= now:
        session.status = SessionStatus.EXPIRED
        session.revoked_reason = "TOKEN_EXPIRED"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    request_device_id = request.headers.get("x-device-id", "web-client")
    if session.device_id != request_device_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session device mismatch")

    request.state.current_session = session
    request.state.token_payload = payload
    return session


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = db.get(User, payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    _validate_session(db, request, user, payload)
    return user


def get_current_session(request: Request) -> AuthSession | None:
    return getattr(request.state, "current_session", None)


def get_token_payload(request: Request) -> dict:
    return getattr(request.state, "token_payload", {})


def get_admin_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user

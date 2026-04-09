from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.security import decode_token
from app.db.session import get_db
from app.fds.types import RequestContext
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_request_context(request: Request) -> RequestContext:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_host = forwarded_for.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    region = request.headers.get("x-region", "KR").upper()
    device_id = request.headers.get("x-device-id", "web-client")
    return RequestContext(ip_address=client_host, region=region, device_id=device_id)


def get_current_user(
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
    return user


def get_admin_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


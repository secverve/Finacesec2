from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_request_context
from app.db.session import get_db
from app.fds.types import RequestContext
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserProfileResponse
from app.schemas.common import MessageResponse
from app.services.auth_service import authenticate_user, logout_user, register_user

router = APIRouter()


@router.post("/register", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> User:
    try:
        user = register_user(
            db=db,
            email=payload.email,
            full_name=payload.full_name,
            password=payload.password,
            context=request_context,
        )
        db.commit()
        db.refresh(user)
        return user
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> TokenResponse:
    try:
        access_token = authenticate_user(
            db=db,
            email=payload.email,
            password=payload.password,
            context=request_context,
        )
        db.commit()
        return TokenResponse(access_token=access_token)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except PermissionError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/logout", response_model=MessageResponse)
def logout(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> MessageResponse:
    logout_user(db=db, user=current_user, context=request_context)
    db.commit()
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserProfileResponse)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


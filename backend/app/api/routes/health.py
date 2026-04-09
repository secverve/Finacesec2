from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.cache import get_redis_client
from app.db.session import get_engine

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    database = "up"
    cache = "up"

    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        database = "down"

    if get_redis_client() is None:
        cache = "down"

    status_value = "ok" if database == "up" else "degraded"
    return {"status": status_value, "database": database, "cache": cache}


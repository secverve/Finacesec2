import logging
import time

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_engine, get_session_factory
from app.services.seed_service import seed_initial_data

logger = logging.getLogger(__name__)


def wait_for_database(max_attempts: int = 30, delay_seconds: int = 2) -> None:
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        return

    for attempt in range(1, max_attempts + 1):
        try:
            with get_engine().connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Database is ready")
            return
        except OperationalError as exc:
            logger.warning("Database not ready (%s/%s): %s", attempt, max_attempts, exc)
            time.sleep(delay_seconds)
    raise RuntimeError("Database connection could not be established")


def bootstrap_database() -> None:
    settings = get_settings()
    wait_for_database()
    Base.metadata.create_all(bind=get_engine())
    if settings.auto_seed:
        db: Session = get_session_factory()()
        try:
            seed_initial_data(db)
            db.commit()
        finally:
            db.close()

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DB_PATH = Path(__file__).resolve().parent / "test_fds_infra.db"


@pytest.fixture(scope="session")
def client() -> TestClient:
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
    os.environ["REDIS_URL"] = "redis://localhost:6390/0"
    os.environ["AUTO_SEED"] = "true"

    from app.core.config import get_settings
    from app.db.session import reset_db_session_state

    get_settings.cache_clear()
    reset_db_session_state()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

    reset_db_session_state()
    get_settings.cache_clear()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

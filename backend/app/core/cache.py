import logging

import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def get_redis_client() -> redis.Redis | None:
    settings = get_settings()
    try:
        client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        return client
    except redis.RedisError as exc:
        logger.warning("Redis unavailable, continuing without cache: %s", exc)
        return None


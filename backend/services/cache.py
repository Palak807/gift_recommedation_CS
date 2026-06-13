import hashlib
import json
from typing import Optional
from ..config import settings

_client = None
_CACHE_VERSION = "v1"


def _get_redis():
    global _client
    if _client is None and settings.redis_url:
        import redis.asyncio as aioredis
        _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


def make_cache_key(contact_dict: dict) -> str:
    """SHA-256 of the canonicalised contact JSON, versioned so schema changes bust the cache."""
    canonical = json.dumps(contact_dict, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    return f"gift_rec:{_CACHE_VERSION}:{digest}"


async def get_cached(key: str) -> Optional[dict]:
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def set_cached(key: str, data: dict) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(data), ex=settings.cache_ttl_seconds)
    except Exception:
        pass


async def delete_cached(key: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        await r.delete(key)
    except Exception:
        pass

from typing import Optional, Any
from ..config import settings

_client: Optional[Any] = None


def get_langfuse() -> Optional[Any]:
    """Return singleton Langfuse client, or None if keys not configured."""
    global _client
    if _client is None and settings.langfuse_secret_key:
        from langfuse import Langfuse
        _client = Langfuse(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_base_url,
        )
    return _client


def create_pipeline_trace(contact_id: str, contact_name: str, occasion: str, tone: str) -> Optional[Any]:
    """Open a root span for one pipeline run. Returns LangfuseSpan or None."""
    lf = get_langfuse()
    if lf is None:
        return None
    try:
        span = lf.start_span(
            name="gift_recommendation",
            input={
                "contact_id": contact_id,
                "contact_name": contact_name,
                "occasion": occasion,
                "tone": tone,
            },
        )
        return span
    except Exception:
        return None


def flush_langfuse() -> None:
    lf = get_langfuse()
    if lf is not None:
        lf.flush()

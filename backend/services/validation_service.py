import httpx
from urllib.parse import urlparse


async def validate_url(url: str) -> bool:
    """Check URL returns 200 or 301/302 (not 404/hallucinated)."""
    if not url or not url.startswith("http"):
        return False

    parsed = urlparse(url)
    if not parsed.netloc:
        return False

    try:
        async with httpx.AsyncClient(
            timeout=8.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; GiftAgent/1.0)"},
        ) as client:
            resp = await client.head(url)
            if resp.status_code == 405:
                resp = await client.get(url)
            return resp.status_code < 400
    except Exception:
        return False


def is_price_in_budget(price: float, budget_min: float, budget_max: float) -> bool:
    if price <= 0:
        return True  # price unknown, don't filter
    return budget_min <= price <= budget_max

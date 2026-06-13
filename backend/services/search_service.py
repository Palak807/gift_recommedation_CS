import httpx
from ..config import settings
from ..models.recommendation import ProductCandidate


async def search_products(query: str, country: str = "us", num: int = 5) -> list[dict]:
    """Search products via SerpAPI Google Shopping."""
    if not settings.serp_api_key:
        return []

    params = {
        "q": query,
        "tbm": "shop",
        "api_key": settings.serp_api_key,
        "gl": country.lower(),
        "hl": "en",
        "num": num,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get("https://serpapi.com/search", params=params)
        response.raise_for_status()
        data = response.json()

    results = []
    for item in data.get("shopping_results", []):
        price_str = item.get("price", "0")
        price = _parse_price(price_str)
        results.append({
            "title": item.get("title", ""),
            "url": item.get("link") or item.get("product_link", ""),
            "price": price,
            "currency": _infer_currency(price_str),
            "seller": item.get("source", ""),
            "description": item.get("snippet", item.get("title", "")),
            "image_url": item.get("thumbnail", ""),
            "search_query_used": query,
        })

    return results


async def search_products_google_cse(query: str, country: str = "us") -> list[dict]:
    """Fallback: Google Custom Search Engine."""
    if not settings.google_cse_api_key or not settings.google_cse_cx:
        return []

    params = {
        "q": query + " buy",
        "key": settings.google_cse_api_key,
        "cx": settings.google_cse_cx,
        "num": 5,
        "gl": country.lower(),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://www.googleapis.com/customsearch/v1", params=params
        )
        response.raise_for_status()
        data = response.json()

    results = []
    for item in data.get("items", []):
        results.append({
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "price": 0.0,
            "currency": "USD",
            "seller": item.get("displayLink", ""),
            "description": item.get("snippet", ""),
            "image_url": "",
            "search_query_used": query,
        })

    return results


def _parse_price(price_str: str) -> float:
    cleaned = "".join(c for c in price_str if c.isdigit() or c == ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _infer_currency(price_str: str) -> str:
    if "₹" in price_str:
        return "INR"
    if "£" in price_str:
        return "GBP"
    if "€" in price_str:
        return "EUR"
    return "USD"

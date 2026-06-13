import asyncio
from langchain_core.runnables import RunnableConfig
from ...models.state import PipelineState
from ...models.recommendation import ProductCandidate, SignalStrength
from ...services.llm_service import call_llm
from ...services.search_service import search_products, search_products_google_cse
from ...config import settings

_QUERY_SCHEMA = {
    "type": "object",
    "properties": {
        "queries": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-5 product search queries, ordered best-first",
        }
    },
    "required": ["queries"],
}

_SYSTEM = """You are a product search query builder for personalised gifting.

Given a person's gifting signals and constraints, generate 3-5 specific product
search queries that would surface real purchasable gifts.

Rules:
- Include price range in queries (e.g. "under $100", "between $50-$150")
- Be specific to their interests, not generic ("premium fountain pen" not "office supplies")
- Include country/region when relevant (e.g. "available in India", "UK delivery")
- Mix types: 1-2 experiential, 1-2 physical products, 1 subscription/digital if appropriate
- Queries should work well in Google Shopping
"""


async def search_products_node(state: PipelineState, config: RunnableConfig = None) -> dict:
    contact = state["contact"]
    signals = state["filtered_signals"]
    constraints = contact.constraints

    langfuse_trace = ((config or {}).get("configurable") or {}).get("langfuse_trace")
    langfuse_span = None
    try:
        if langfuse_trace is not None:
            langfuse_span = langfuse_trace.start_span(
                name="search_products",
                input={"query_count": len(state.get("search_queries", []))},
            )
    except Exception:
        pass

    if not signals:
        try:
            if langfuse_span is not None:
                langfuse_span.update(output={"product_count": 0, "note": "no signals"})
                langfuse_span.end()
        except Exception:
            pass
        return {
            "pipeline_warnings": ["No signals after filtering — using generic queries"],
            "search_queries": [],
            "product_candidates": [],
        }

    signal_summary = "\n".join(
        f"- [{s.strength.value}] {s.signal}" for s in signals[:10]
    )

    result = await call_llm(
        _SYSTEM,
        f"""Person: {contact.name}
Occasion: {constraints.occasion}
Relationship: {constraints.relationship}
Budget: {constraints.budget_min}–{constraints.budget_max} {constraints.currency}
Country: {constraints.country}
Avoid categories: {', '.join(constraints.avoid_categories)}

Top gifting signals:
{signal_summary}

Generate targeted product search queries.""",
        response_schema=_QUERY_SCHEMA,
    )

    queries = result.get("queries", [])[:5]

    # Search in parallel (rate-limit: 3 at a time)
    all_candidates = []
    sem = asyncio.Semaphore(3)

    async def _search_one(q: str) -> list[dict]:
        async with sem:
            try:
                results = await search_products(q, country=constraints.country)
                if not results:
                    results = await search_products_google_cse(q, country=constraints.country)
                return results
            except Exception as e:
                return []

    batches = await asyncio.gather(*[_search_one(q) for q in queries])
    for batch in batches:
        all_candidates.extend(batch)

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique = []
    for item in all_candidates:
        url = item.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            try:
                candidate = ProductCandidate(**item)
                unique.append(candidate)
            except Exception:
                pass

    warnings = []
    if len(unique) < settings.min_valid_products and state.get("search_retry_count", 0) == 0:
        warnings.append(f"Only {len(unique)} products found — search results sparse")

    try:
        if langfuse_span is not None:
            langfuse_span.update(output={"product_count": len(unique)})
            langfuse_span.end()
    except Exception:
        pass
    return {
        "search_queries": queries,
        "product_candidates": unique,
        "pipeline_warnings": warnings,
    }

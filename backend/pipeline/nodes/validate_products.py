import asyncio
from langchain_core.runnables import RunnableConfig
from ...models.state import PipelineState
from ...models.recommendation import ProductCandidate
from ...services.validation_service import validate_url, is_price_in_budget
from ...services.llm_service import call_llm

_RELEVANCE_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "relevance_score": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["index", "relevance_score"],
            },
        }
    },
    "required": ["scores"],
}

_SYSTEM = """You are a gift relevance scorer. For each product candidate, score
0.0-1.0 how well it matches the person's interests and the gifting context.

Consider:
- How well it maps to their specific signals/interests (0.5+ weight)
- Professional appropriateness for the relationship (0.2 weight)
- Practicality and quality for the price point (0.2 weight)
- Uniqueness / thoughtfulness (0.1 weight)

Be discriminating — most products should score 0.3-0.7. Reserve 0.8+ for strong matches."""


async def validate_products_node(state: PipelineState, config: RunnableConfig = None) -> dict:
    contact = state["contact"]
    constraints = contact.constraints
    candidates = state["product_candidates"]

    langfuse_trace = ((config or {}).get("configurable") or {}).get("langfuse_trace")
    langfuse_span = None
    try:
        if langfuse_trace is not None:
            langfuse_span = langfuse_trace.start_span(
                name="validate_products",
                input={"query_count": len(state.get("search_queries", []))},
            )
    except Exception:
        pass

    if not candidates:
        try:
            if langfuse_span is not None:
                langfuse_span.update(output={"product_count": 0, "note": "no candidates"})
                langfuse_span.end()
        except Exception:
            pass
        return {"validated_products": [], "pipeline_warnings": ["No candidates to validate"]}

    # Step 1: URL validation in parallel (max 5 concurrent)
    sem = asyncio.Semaphore(5)

    async def _check(c: ProductCandidate) -> ProductCandidate:
        async with sem:
            valid = await validate_url(c.url)
            in_budget = is_price_in_budget(
                c.price, constraints.budget_min, constraints.budget_max
            )
            return c.model_copy(update={"url_valid": valid, "in_budget": in_budget})

    checked = await asyncio.gather(*[_check(c) for c in candidates])

    # Keep only valid-URL or unknown-price products that are in budget
    shortlisted = [
        c for c in checked
        if (c.url_valid is not False) and c.in_budget
    ]

    if not shortlisted:
        # Widen: keep all in-budget even if URL check uncertain
        shortlisted = [c for c in checked if c.in_budget]

    warnings = []
    if len(shortlisted) < 3:
        warnings.append(
            f"Only {len(shortlisted)} products passed validation — lowering confidence"
        )

    # Step 2: LLM relevance scoring (batch up to 15)
    batch = shortlisted[:15]
    signals = state["filtered_signals"]
    signal_text = "; ".join(s.signal for s in signals[:8])

    product_list = "\n".join(
        f"{i}. {p.title} — {p.seller} — {p.currency}{p.price} — {p.description[:120]}"
        for i, p in enumerate(batch)
    )

    result = await call_llm(
        _SYSTEM,
        f"""Person signals: {signal_text}
Occasion: {contact.constraints.occasion}
Relationship: {contact.constraints.relationship}

Products to score:
{product_list}""",
        response_schema=_RELEVANCE_SCHEMA,
        max_tokens=1024,
    )

    score_map = {item["index"]: item["relevance_score"] for item in result.get("scores", [])}
    scored = [
        p.model_copy(update={"relevance_score": score_map.get(i, 0.3)})
        for i, p in enumerate(batch)
    ]
    scored.sort(key=lambda p: p.relevance_score, reverse=True)

    try:
        if langfuse_span is not None:
            langfuse_span.update(output={"product_count": len(scored)})
            langfuse_span.end()
    except Exception:
        pass
    return {
        "validated_products": scored,
        "pipeline_warnings": warnings,
    }

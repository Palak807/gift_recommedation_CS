from langchain_core.runnables import RunnableConfig
from ...models.state import PipelineState
from ...models.recommendation import GiftRecommendation
from ...services.llm_service import call_llm, call_llm_streaming

_RANK_SCHEMA = {
    "type": "object",
    "properties": {
        "rankings": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "product_index": {"type": "integer"},
                    "reasoning": {"type": "string"},
                    "confidence_score": {"type": "number"},
                    "risk_level": {"type": "string", "enum": ["low", "medium", "high"]},
                    "assumptions": {"type": "array", "items": {"type": "string"}},
                    "signals_matched": {"type": "array", "items": {"type": "string"}},
                },
                "required": [
                    "product_index", "reasoning", "confidence_score",
                    "risk_level", "assumptions", "signals_matched"
                ],
            },
        },
        "overall_reasoning": {
            "type": "string",
            "description": "2-4 sentences on the overall ranking strategy: which signals drove selection, how products were differentiated, and any trade-offs made between safety and personalisation",
        },
    },
    "required": ["rankings", "overall_reasoning"],
}

_SYSTEM = """You are a senior gifting strategist. Pick the top 3 gifts from a
shortlist and justify each choice.

For each pick:
- reasoning: 2-3 sentences explaining WHY this gift for THIS person
- confidence_score 0.0-1.0: how certain you are this will land well
  (lower if weak signals, generic product, or unusual occasion)
- risk_level: low (safe, universally appreciated), medium (specific taste),
  high (could miss or feel too personal)
- assumptions: what you're assuming about the person that isn't proven
- signals_matched: which signals from the profile this gift addresses

Rank 1 = safest best match. Rank 3 = more adventurous/specific pick.
Penalise: generic products, items that could be bought anywhere, low-quality items."""


async def rank_gifts_node(state: PipelineState, config: RunnableConfig) -> dict:
    contact = state["contact"]
    signals = state["filtered_signals"]
    products = state["validated_products"][:12]

    if not products:
        return {
            "ranked_recommendations": [],
            "pipeline_warnings": ["No validated products to rank"],
        }

    signal_summary = "\n".join(
        f"- [{s.strength.value}] {s.signal} (category: {s.category})"
        for s in signals[:10]
    )

    product_list = "\n".join(
        f"{i}. {p.title} | {p.seller} | {p.currency}{p.price} | relevance={p.relevance_score:.2f}\n"
        f"   {p.description[:150]}"
        for i, p in enumerate(products)
    )

    user_prompt = f"""Select top 3 gifts for: {contact.name}
Occasion: {contact.constraints.occasion}
Relationship: {contact.constraints.relationship}
Budget: {contact.constraints.budget_min}–{contact.constraints.budget_max} {contact.constraints.currency}
Low-signal flag: {state.get('low_signal_flag', False)}

Person's signals:
{signal_summary}

Product candidates:
{product_list}"""

    token_queue = (config.get("configurable") or {}).get("token_queue")
    metrics_list = (config.get("configurable") or {}).get("metrics_list")
    langfuse_trace = (config.get("configurable") or {}).get("langfuse_trace")
    langfuse_span = None
    try:
        if langfuse_trace is not None:
            langfuse_span = langfuse_trace.start_span(
                name="rank_gifts",
                input={"product_count": len(products), "budget": f"{contact.constraints.budget_min}-{contact.constraints.budget_max}"},
            )
    except Exception:
        pass

    if token_queue is not None:
        result = await call_llm_streaming(
            _SYSTEM, user_prompt, token_queue, "rank_gifts",
            response_schema=_RANK_SCHEMA, max_tokens=2048,
            langfuse_parent=langfuse_span,
        )
    else:
        result = await call_llm(
            _SYSTEM, user_prompt, response_schema=_RANK_SCHEMA, max_tokens=2048,
            langfuse_parent=langfuse_span,
        )

    recommendations = []
    for rank_idx, item in enumerate(result.get("rankings", [])[:3], start=1):
        prod_idx = item["product_index"]
        if prod_idx >= len(products):
            continue
        product = products[prod_idx]

        confidence = item["confidence_score"]
        if state.get("low_signal_flag"):
            confidence = min(confidence, 0.65)
        if len(products) < 5:
            confidence = min(confidence, 0.70)

        recommendations.append(GiftRecommendation(
            rank=rank_idx,
            product=product,
            personalised_message="",
            reasoning=item["reasoning"],
            confidence_score=round(confidence, 2),
            risk_level=item["risk_level"],
            assumptions=item.get("assumptions", []),
            signals_matched=item.get("signals_matched", []),
        ))

    try:
        if langfuse_span is not None:
            langfuse_span.update(output={"recommendation_count": len(recommendations), "reasoning": result.get("overall_reasoning", "")[:200]})
            langfuse_span.end()
    except Exception:
        pass
    return {
        "ranked_recommendations": recommendations,
        "stage_reasoning": {"rank_gifts": result.get("overall_reasoning", "")},
    }

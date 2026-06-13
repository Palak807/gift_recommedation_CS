from langchain_core.runnables import RunnableConfig
from ...models.state import PipelineState
from ...services.llm_service import call_llm, call_llm_streaming

_SENSITIVE_KEYWORDS = [
    "religion", "religious", "faith", "church", "mosque", "temple", "prayer",
    "politics", "political", "party", "election", "democrat", "republican",
    "health", "illness", "disease", "medical", "surgery", "cancer", "disability",
    "gender", "sexuality", "lgbtq", "pregnancy", "pregnant",
    "ethnicity", "race", "racial",
    "family status", "divorce", "marriage status", "kids", "children",
]

_SCHEMA = {
    "type": "object",
    "properties": {
        "safe_indices": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "0-based indices of signals that are safe to use for gifting",
        },
        "filtered_reasons": {
            "type": "array",
            "items": {"type": "string"},
        },
        "llm_reasoning": {
            "type": "string",
            "description": "1-2 sentences explaining what was filtered and why, noting any close calls",
        },
    },
    "required": ["safe_indices", "filtered_reasons", "llm_reasoning"],
}

_SYSTEM = """You are a professional workplace gifting compliance filter.

Review each signal and mark it UNSAFE if it touches:
- Religion or spiritual beliefs
- Political views or affiliations
- Personal health, medical conditions, or disabilities
- Gender identity or sexuality
- Ethnicity, race, or nationality stereotypes
- Family/relationship status (divorce, pregnancy, kids)

Return indices of SAFE signals only. For filtered signals, note why briefly.
When in doubt, filter it out — professional safety is paramount."""


async def filter_signals_node(state: PipelineState, config: RunnableConfig) -> dict:
    signals = state["raw_signals"]
    if not signals:
        return {"filtered_signals": [], "filtered_out_reasons": []}

    # Rule-based pre-filter
    rule_filtered = []
    rule_safe = []
    for i, sig in enumerate(signals):
        sig_lower = (sig.signal + " " + sig.category).lower()
        if any(kw in sig_lower for kw in _SENSITIVE_KEYWORDS):
            rule_filtered.append(f"[rule] {sig.signal} — sensitive keyword match")
        else:
            rule_safe.append((i, sig))

    if not rule_safe:
        return {
            "filtered_signals": [],
            "filtered_out_reasons": rule_filtered,
        }

    # LLM second-pass on rule_safe candidates
    indexed_signals = "\n".join(
        f"{j}. [{s.strength.value}] {s.signal} (source: {s.source})"
        for j, (_, s) in enumerate(rule_safe)
    )

    token_queue = (config.get("configurable") or {}).get("token_queue")
    metrics_list = (config.get("configurable") or {}).get("metrics_list")
    langfuse_trace = (config.get("configurable") or {}).get("langfuse_trace")
    langfuse_span = None
    try:
        if langfuse_trace is not None:
            langfuse_span = langfuse_trace.start_span(
                name="filter_signals",
                input={"raw_signal_count": len(state["raw_signals"])},
            )
    except Exception:
        pass

    if token_queue is not None:
        result = await call_llm_streaming(
            _SYSTEM,
            f"Review these signals for professional gifting safety:\n{indexed_signals}",
            token_queue,
            "filter_signals",
            response_schema=_SCHEMA,
            metrics_out=metrics_list,
            langfuse_parent=langfuse_span,
        )
    else:
        result = await call_llm(
            _SYSTEM,
            f"Review these signals for professional gifting safety:\n{indexed_signals}",
            response_schema=_SCHEMA,
            metrics_out=metrics_list,
            langfuse_parent=langfuse_span,
        )

    safe_idx_set = set(result.get("safe_indices", []))
    filtered_signals = [rule_safe[j][1] for j in safe_idx_set if j < len(rule_safe)]
    llm_filtered = result.get("filtered_reasons", [])

    try:
        if langfuse_span is not None:
            langfuse_span.update(output={"filtered_count": len(filtered_signals), "reasoning": result.get("llm_reasoning", "")})
            langfuse_span.end()
    except Exception:
        pass
    return {
        "filtered_signals": filtered_signals,
        "filtered_out_reasons": rule_filtered + llm_filtered,
        "stage_reasoning": {"filter_signals": result.get("llm_reasoning", "")},
    }

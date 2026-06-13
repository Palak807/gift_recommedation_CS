from langchain_core.runnables import RunnableConfig
from ...models.state import PipelineState
from ...models.recommendation import GiftSignal
from ...services.llm_service import call_llm, call_llm_streaming

_SCHEMA = {
    "type": "object",
    "properties": {
        "signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "signal": {"type": "string"},
                    "strength": {"type": "string", "enum": ["strong", "moderate", "weak"]},
                    "source": {"type": "string"},
                },
                "required": ["category", "signal", "strength", "source"],
            },
        },
        "low_signal": {"type": "boolean"},
        "llm_reasoning": {
            "type": "string",
            "description": "2-3 sentences explaining which signals were prioritised and why, and what the overall gifting profile looks like",
        },
    },
    "required": ["signals", "low_signal", "llm_reasoning"],
}

_SYSTEM = """You are a gifting intelligence engine. Your job is to extract
actionable gifting signals from a person's LinkedIn profile data.

Focus on:
- Professional interests and passions (talks about AI, runs marathons, loves design)
- Hobbies hinted in posts/comments
- Career milestones (new job, promotion, conference speaker)
- Intellectual interests (books referenced, topics engaged)
- Lifestyle indicators from content they share

Classify each signal:
- strong: explicit statement or repeated pattern
- moderate: inferred from 1-2 data points
- weak: single hint or general industry norm

Be specific: "passionate about endurance sports — posts about ultra-marathons" beats "likes fitness".
Output 5-15 signals. Set low_signal=true if fewer than 4 strong/moderate signals found."""


async def extract_signals_node(state: PipelineState, config: RunnableConfig) -> dict:
    contact = state["contact"]
    ld = contact.linkedin_data

    user_prompt = f"""Extract gifting signals for: {contact.name}

Headline: {ld.headline}
Summary: {ld.summary}
Role: {ld.current_role} at {ld.current_company}
Industry: {ld.industry}
Skills: {', '.join(ld.skills[:20])}
Recent posts: {chr(10).join(ld.recent_posts[:5])}
Comments: {chr(10).join(ld.recent_comments[:5])}
Engaged topics: {', '.join(ld.engaged_topics)}
Education: {', '.join(ld.education)}
Certifications: {', '.join(ld.certifications)}
Volunteer: {', '.join(ld.volunteer_work)}
Awards: {', '.join(ld.honors_awards)}
Interests: {', '.join(ld.interests)}
"""

    token_queue = (config.get("configurable") or {}).get("token_queue")
    metrics_list = (config.get("configurable") or {}).get("metrics_list")
    langfuse_trace = (config.get("configurable") or {}).get("langfuse_trace")
    langfuse_span = None
    try:
        if langfuse_trace is not None:
            langfuse_span = langfuse_trace.start_span(
                name="extract_signals",
                input={"contact": contact.name, "headline": ld.headline},
            )
    except Exception:
        pass

    if token_queue is not None:
        result = await call_llm_streaming(
            _SYSTEM, user_prompt, token_queue, "extract_signals", response_schema=_SCHEMA,
            langfuse_parent=langfuse_span,
        )
    else:
        result = await call_llm(
            _SYSTEM, user_prompt, response_schema=_SCHEMA,
            langfuse_parent=langfuse_span,
        )

    signals = [GiftSignal(**s) for s in result["signals"]]
    try:
        if langfuse_span is not None:
            langfuse_span.update(output={"signal_count": len(signals), "low_signal": result.get("low_signal", False)})
            langfuse_span.end()
    except Exception:
        pass
    return {
        "raw_signals": signals,
        "low_signal_flag": result.get("low_signal", False),
        "stage_reasoning": {"extract_signals": result.get("llm_reasoning", "")},
    }

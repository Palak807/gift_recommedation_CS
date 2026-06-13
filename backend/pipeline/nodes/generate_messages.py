from langchain_core.runnables import RunnableConfig
from ...models.state import PipelineState
from ...services.llm_service import call_llm, call_llm_streaming

_MSG_SCHEMA = {
    "type": "object",
    "properties": {
        "messages": {
            "type": "array",
            "items": {"type": "string"},
        },
        "llm_reasoning": {
            "type": "string",
            "description": "1-2 sentences on tone choices: relationship formality level chosen, personalisation hooks used, and what was deliberately avoided",
        },
    },
    "required": ["messages", "llm_reasoning"],
}

TONE_INSTRUCTIONS = {
    "formal":    "Use formal, professional language. Respectful and measured.",
    "warm":      "Use warm, collegial language. Genuine and personal.",
    "playful":   "Use light, playful language. A touch of wit is welcome.",
    "concise":   "Be extremely concise. One or two sentences max. No filler.",
    "inspiring": "Use motivational language tied to their achievements and aspirations.",
}

_SYSTEM = """You are a thoughtful professional relationship expert.

Write short, warm, personalised gift messages — one per gift.

Rules:
- 2-3 sentences max, conversational tone
- Reference WHY you chose this specific gift (tied to their interest)
- Match tone to relationship: formal for clients/senior mentors, warm for colleagues/friends
- Do NOT mention price, budget, or where you bought it
- Do NOT use clichés like "I thought of you when..." or "Hope you enjoy..."
- Make it feel like you actually know this person
- No emojis, no exclamation marks"""


async def generate_messages_node(state: PipelineState, config: RunnableConfig) -> dict:
    contact = state["contact"]
    recommendations = state["ranked_recommendations"]

    if not recommendations:
        return {}

    gift_list = "\n\n".join(
        f"Gift {r.rank}: {r.product.title}\n"
        f"Reasoning: {r.reasoning}\n"
        f"Signals matched: {', '.join(r.signals_matched)}"
        for r in recommendations
    )

    tone = contact.constraints.tone.value

    user_prompt = f"""Write personalised messages for each gift.

Recipient: {contact.name}
Relationship: {contact.constraints.relationship}
Occasion: {contact.constraints.occasion}
Tone instruction: {TONE_INSTRUCTIONS[tone]}

Gifts:
{gift_list}"""

    token_queue = (config.get("configurable") or {}).get("token_queue")
    metrics_list = (config.get("configurable") or {}).get("metrics_list")
    langfuse_trace = (config.get("configurable") or {}).get("langfuse_trace")
    langfuse_span = None
    try:
        if langfuse_trace is not None:
            langfuse_span = langfuse_trace.start_span(
                name="generate_messages",
                input={"tone": tone, "recommendation_count": len(recommendations)},
            )
    except Exception:
        pass

    if token_queue is not None:
        result = await call_llm_streaming(
            _SYSTEM, user_prompt, token_queue, "generate_messages", response_schema=_MSG_SCHEMA,
            langfuse_parent=langfuse_span,
        )
    else:
        result = await call_llm(
            _SYSTEM, user_prompt, response_schema=_MSG_SCHEMA,
            langfuse_parent=langfuse_span,
        )

    messages = result.get("messages", [])
    updated = []
    for i, rec in enumerate(recommendations):
        msg = messages[i] if i < len(messages) else ""
        updated.append(rec.model_copy(update={"personalised_message": msg}))

    try:
        if langfuse_span is not None:
            langfuse_span.update(output={"message_count": len(updated), "reasoning": result.get("llm_reasoning", "")})
            langfuse_span.end()
    except Exception:
        pass
    return {
        "ranked_recommendations": updated,
        "stage_reasoning": {"generate_messages": result.get("llm_reasoning", "")},
    }

from ...models.state import PipelineState
from ...models.recommendation import RecommendationResult, ReviewStatus


async def assemble_result_node(state: PipelineState) -> dict:
    contact = state["contact"]

    result = RecommendationResult(
        contact_id=contact.contact_id,
        contact_name=contact.name,
        signals_extracted=state.get("raw_signals", []),
        signals_filtered_out=state.get("filtered_out_reasons", []),
        search_queries_used=state.get("search_queries", []),
        products_considered=state.get("validated_products", []),
        top_3_recommendations=state.get("ranked_recommendations", []),
        review_status=ReviewStatus.pending,
        pipeline_warnings=list(dict.fromkeys(state.get("pipeline_warnings", []))),
        low_signal_flag=state.get("low_signal_flag", False),
        stage_reasoning=state.get("stage_reasoning", {}),
    )

    return {"final_result": result}

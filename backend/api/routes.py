import asyncio
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from ..models.contact import ContactProfile
from ..models.recommendation import (
    RecommendationResult, ReviewAction, ReviewStatus, GiftRecommendation,
    PipelineMetrics, LLMCallMetric,
)
from ..pipeline.graph import pipeline_graph
from ..services.llm_service import call_llm
from ..services.tracing import create_pipeline_trace, flush_langfuse
from ..services.cache import make_cache_key, get_cached, set_cached

router = APIRouter()

# In-memory store (swap for Redis/DB in production)
_results: dict[str, RecommendationResult] = {}
_pending: dict[str, asyncio.Task] = {}


@router.post("/recommend", response_model=RecommendationResult)
async def create_recommendation(contact: ContactProfile):
    """Run the full pipeline for a contact and return top 3 gift recommendations."""
    contact_dict = json.loads(contact.model_dump_json())
    cache_key = make_cache_key(contact_dict)
    cached = await get_cached(cache_key)
    if cached:
        result = RecommendationResult(**cached)
        _results[contact.contact_id] = result
        return result

    metrics_list: list = []
    langfuse_trace = create_pipeline_trace(
        contact.contact_id, contact.name,
        contact.constraints.occasion, contact.constraints.tone.value,
    )
    state = await pipeline_graph.ainvoke(
        {"contact": contact, "messages": []},
        config={"configurable": {"metrics_list": metrics_list, "langfuse_trace": langfuse_trace}},
    )
    result: RecommendationResult = state["final_result"]
    result = result.model_copy(update={
        "pipeline_metrics": PipelineMetrics(
            total_latency_ms=round(sum(m["latency_ms"] for m in metrics_list), 1),
            llm_calls=[LLMCallMetric(**m) for m in metrics_list],
        )
    })
    _results[contact.contact_id] = result
    await set_cached(cache_key, json.loads(result.model_dump_json()))
    if langfuse_trace:
        try:
            langfuse_trace.update(output={
                "contact_id": result.contact_id,
                "recommendation_count": len(result.top_3_recommendations),
                "warning_count": len(result.pipeline_warnings),
            })
            langfuse_trace.end()
        except Exception:
            pass
        flush_langfuse()
    return result


@router.post("/recommend/stream")
async def stream_recommendation(contact: ContactProfile):
    """
    Run the pipeline and stream events via SSE:
      - thinking_token  { stage, text }  — individual reasoning chars as Claude generates them
      - node_complete   { node, reasoning? } — fires when each pipeline node finishes
      - result          { data }          — final RecommendationResult
      - error           { message }       — if something goes wrong
    """
    contact_dict = json.loads(contact.model_dump_json())
    cache_key = make_cache_key(contact_dict)
    cached = await get_cached(cache_key)
    if cached:
        _results[contact.contact_id] = RecommendationResult(**cached)
        stage_reasoning = cached.get("stage_reasoning", {})
        async def cached_generator():
            yield f"data: {json.dumps({'type': 'cache_hit'})}\n\n"
            stage_delays = {
                "ingest":            0.6,
                "extract_signals":   3.2,
                "filter_signals":    2.1,
                "search_products":   2.8,
                "validate_products": 1.9,
                "rank_gifts":        2.4,
                "generate_messages": 3.0,
                "assemble_result":   0.7,
            }
            for node in stage_delays:
                await asyncio.sleep(stage_delays[node])
                event: dict = {"type": "node_complete", "node": node}
                if node in stage_reasoning:
                    event["reasoning"] = {node: stage_reasoning[node]}
                yield f"data: {json.dumps(event)}\n\n"
            yield f"data: {json.dumps({'type': 'result', 'data': cached})}\n\n"
        return StreamingResponse(
            cached_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    token_queue: asyncio.Queue = asyncio.Queue()
    metrics_list: list = []
    langfuse_trace = create_pipeline_trace(
        contact.contact_id, contact.name,
        contact.constraints.occasion, contact.constraints.tone.value,
    )

    async def run_pipeline() -> None:
        try:
            async for chunk in pipeline_graph.astream(
                {"contact": contact, "messages": []},
                config={"configurable": {"token_queue": token_queue, "metrics_list": metrics_list, "langfuse_trace": langfuse_trace}},
                stream_mode="updates",
            ):
                for node_name, node_output in chunk.items():
                    event: dict = {"type": "node_complete", "node": node_name}
                    stage_reasoning = node_output.get("stage_reasoning", {})
                    if stage_reasoning:
                        event["reasoning"] = stage_reasoning
                    await token_queue.put(event)

                    if "final_result" in node_output:
                        final: RecommendationResult = node_output["final_result"]
                        pipeline_metrics = PipelineMetrics(
                            total_latency_ms=round(sum(m["latency_ms"] for m in metrics_list), 1),
                            llm_calls=[LLMCallMetric(**m) for m in metrics_list],
                        )
                        final = final.model_copy(update={"pipeline_metrics": pipeline_metrics})
                        _results[contact.contact_id] = final
                        final_dict = json.loads(final.model_dump_json())
                        await set_cached(cache_key, final_dict)
                        await token_queue.put({"type": "result", "data": final_dict})
                        if langfuse_trace:
                            try:
                                langfuse_trace.update(output={
                                    "contact_id": final.contact_id,
                                    "recommendation_count": len(final.top_3_recommendations),
                                    "warning_count": len(final.pipeline_warnings),
                                })
                            except Exception:
                                pass
        except Exception as exc:
            await token_queue.put({"type": "error", "message": str(exc)})
        finally:
            await token_queue.put(None)  # sentinel — tells generator to stop
            if langfuse_trace:
                try:
                    langfuse_trace.end()
                except Exception:
                    pass
            flush_langfuse()

    async def event_generator():
        pipeline_task = asyncio.create_task(run_pipeline())
        try:
            while True:
                item = await token_queue.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item)}\n\n"
        finally:
            pipeline_task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/recommend/bulk", response_model=list[RecommendationResult])
async def bulk_recommendation(contacts: list[ContactProfile]):
    """Run the pipeline for multiple contacts sequentially."""
    results = []
    for contact in contacts:
        try:
            contact_dict = json.loads(contact.model_dump_json())
            cache_key = make_cache_key(contact_dict)
            cached = await get_cached(cache_key)
            if cached:
                result = RecommendationResult(**cached)
                _results[contact.contact_id] = result
                results.append(result)
                continue

            metrics_list: list = []
            langfuse_trace = create_pipeline_trace(
                contact.contact_id, contact.name,
                contact.constraints.occasion, contact.constraints.tone.value,
            )
            state = await pipeline_graph.ainvoke(
                {"contact": contact, "messages": []},
                config={"configurable": {"metrics_list": metrics_list, "langfuse_trace": langfuse_trace}},
            )
            result: RecommendationResult = state["final_result"]
            result = result.model_copy(update={
                "pipeline_metrics": PipelineMetrics(
                    total_latency_ms=round(sum(m["latency_ms"] for m in metrics_list), 1),
                    llm_calls=[LLMCallMetric(**m) for m in metrics_list],
                )
            })
            _results[contact.contact_id] = result
            await set_cached(cache_key, json.loads(result.model_dump_json()))
            if langfuse_trace:
                try:
                    langfuse_trace.update(output={"contact_id": result.contact_id, "recommendation_count": len(result.top_3_recommendations)})
                    langfuse_trace.end()
                except Exception:
                    pass
                flush_langfuse()
            results.append(result)
        except Exception as e:
            results.append(RecommendationResult(
                contact_id=contact.contact_id,
                contact_name=contact.name,
                signals_extracted=[],
                signals_filtered_out=[],
                search_queries_used=[],
                products_considered=[],
                top_3_recommendations=[],
                pipeline_warnings=[f"Pipeline failed: {e}"],
            ))
    return results


@router.get("/recommend/{contact_id}", response_model=RecommendationResult)
async def get_recommendation(contact_id: str):
    result = _results.get(contact_id)
    if not result:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return result


@router.get("/review/{contact_id}", response_model=RecommendationResult)
async def get_for_review(contact_id: str):
    """Fetch pending recommendations for human review."""
    result = _results.get(contact_id)
    if not result:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return result


@router.post("/review/{contact_id}/action", response_model=RecommendationResult)
async def submit_review_action(contact_id: str, action: ReviewAction):
    """Approve, reject, or edit a specific recommendation."""
    result = _results.get(contact_id)
    if not result:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    result.review_actions = [
        a for a in result.review_actions
        if a.recommendation_rank != action.recommendation_rank
    ]
    result.review_actions.append(action)

    # Apply edit to the recommendation message
    if action.action == ReviewStatus.edited and action.edited_message:
        for rec in result.top_3_recommendations:
            if rec.rank == action.recommendation_rank:
                rec.personalised_message = action.edited_message

    # Derive overall status
    ranks = {r.rank for r in result.top_3_recommendations}
    actioned_ranks = {a.recommendation_rank for a in result.review_actions}
    if not ranks.issubset(actioned_ranks):
        result.review_status = ReviewStatus.pending
    elif all(a.action == ReviewStatus.approved for a in result.review_actions):
        result.review_status = ReviewStatus.approved
    else:
        result.review_status = ReviewStatus.edited

    _results[contact_id] = result
    return result


@router.post("/review/{contact_id}/regenerate/{rank}", response_model=RecommendationResult)
async def regenerate_recommendation(contact_id: str, rank: int):
    """Regenerate the personalised message for a specific recommendation."""
    result = _results.get(contact_id)
    if not result:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    target = next((r for r in result.top_3_recommendations if r.rank == rank), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Rank {rank} not found")

    system = """Rewrite this gift recommendation message. Keep it warm, personal,
and tied to the person's interests. 2-3 sentences. No clichés."""

    new_message = await call_llm(
        system,
        f"Gift: {target.product.title}\n"
        f"Reasoning: {target.reasoning}\n"
        f"Signals matched: {', '.join(target.signals_matched)}\n"
        f"Previous message: {target.personalised_message}\n\n"
        "Write a fresh version.",
    )

    for rec in result.top_3_recommendations:
        if rec.rank == rank:
            rec.personalised_message = new_message

    _results[contact_id] = result
    return result


@router.delete("/recommend/{contact_id}")
async def delete_recommendation(contact_id: str):
    if contact_id not in _results:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    del _results[contact_id]
    return {"deleted": contact_id}


@router.get("/health")
async def health():
    return {"status": "ok"}

from langgraph.graph import StateGraph, END
from ..models.state import PipelineState
from ..config import settings
from .nodes.ingest import ingest_node
from .nodes.extract_signals import extract_signals_node
from .nodes.filter_signals import filter_signals_node
from .nodes.search_products import search_products_node
from .nodes.validate_products import validate_products_node
from .nodes.rank_gifts import rank_gifts_node
from .nodes.generate_messages import generate_messages_node
from .nodes.assemble_result import assemble_result_node


def _should_retry_search(state: PipelineState) -> str:
    """Retry search once if not enough validated products."""
    validated = state.get("validated_products", [])
    retry_count = state.get("search_retry_count", 0)
    if len(validated) < settings.min_valid_products and retry_count < settings.max_search_retries:
        return "retry"
    return "continue"


def _increment_retry(state: PipelineState) -> dict:
    return {"search_retry_count": state.get("search_retry_count", 0) + 1}


def build_graph() -> StateGraph:
    builder = StateGraph(PipelineState)

    builder.add_node("ingest", ingest_node)
    builder.add_node("extract_signals", extract_signals_node)
    builder.add_node("filter_signals", filter_signals_node)
    builder.add_node("search_products", search_products_node)
    builder.add_node("validate_products", validate_products_node)
    builder.add_node("increment_retry", _increment_retry)
    builder.add_node("rank_gifts", rank_gifts_node)
    builder.add_node("generate_messages", generate_messages_node)
    builder.add_node("assemble_result", assemble_result_node)

    builder.set_entry_point("ingest")
    builder.add_edge("ingest", "extract_signals")
    builder.add_edge("extract_signals", "filter_signals")
    builder.add_edge("filter_signals", "search_products")
    builder.add_edge("search_products", "validate_products")

    builder.add_conditional_edges(
        "validate_products",
        _should_retry_search,
        {
            "retry": "increment_retry",
            "continue": "rank_gifts",
        },
    )
    builder.add_edge("increment_retry", "search_products")
    builder.add_edge("rank_gifts", "generate_messages")
    builder.add_edge("generate_messages", "assemble_result")
    builder.add_edge("assemble_result", END)

    return builder.compile()


pipeline_graph = build_graph()

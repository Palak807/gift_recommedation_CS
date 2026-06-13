from typing import Optional, Annotated
import operator
from langgraph.graph import MessagesState
from .contact import ContactProfile
from .recommendation import (
    GiftSignal, ProductCandidate, GiftRecommendation, RecommendationResult
)


def _merge_dicts(a: dict, b: dict) -> dict:
    return {**a, **b}


class PipelineState(MessagesState):
    # Input
    contact: Optional[ContactProfile] = None

    # Stage outputs (accumulated)
    raw_signals: Annotated[list[GiftSignal], operator.add] = []
    filtered_signals: Annotated[list[GiftSignal], operator.add] = []
    filtered_out_reasons: Annotated[list[str], operator.add] = []
    search_queries: Annotated[list[str], operator.add] = []
    product_candidates: Annotated[list[ProductCandidate], operator.add] = []
    validated_products: Annotated[list[ProductCandidate], operator.add] = []
    ranked_recommendations: list[GiftRecommendation] = []
    final_result: Optional[RecommendationResult] = None

    # LLM reasoning captured at each stage
    stage_reasoning: Annotated[dict, _merge_dicts] = {}

    # Control flags
    low_signal_flag: bool = False
    pipeline_warnings: Annotated[list[str], operator.add] = []
    retry_search: bool = False
    search_retry_count: int = 0

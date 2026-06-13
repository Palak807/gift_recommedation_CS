from pydantic import BaseModel, Field, computed_field
from typing import Optional
from enum import Enum


class SignalStrength(str, Enum):
    strong = "strong"
    moderate = "moderate"
    weak = "weak"


class GiftSignal(BaseModel):
    category: str
    signal: str
    strength: SignalStrength
    source: str  # which part of linkedin data this came from


class ProductCandidate(BaseModel):
    title: str
    url: str
    price: float
    currency: str
    seller: str
    description: str
    image_url: Optional[str] = None
    in_budget: bool = True
    url_valid: Optional[bool] = None
    relevance_score: float = 0.0
    search_query_used: str = ""


class GiftRecommendation(BaseModel):
    rank: int
    product: ProductCandidate
    personalised_message: str
    reasoning: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    risk_level: str  # low / medium / high
    assumptions: list[str] = Field(default_factory=list)
    signals_matched: list[str] = Field(default_factory=list)


class ReviewStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    edited = "edited"
    regenerate_requested = "regenerate_requested"


class ReviewAction(BaseModel):
    recommendation_rank: int
    action: ReviewStatus
    edited_message: Optional[str] = None
    rejection_reason: Optional[str] = None


class LLMCallMetric(BaseModel):
    stage: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: float = 0.0

    @computed_field
    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    @computed_field
    @property
    def estimated_cost_usd(self) -> float:
        # Claude Sonnet via Bedrock: ~$3/1M input, ~$15/1M output
        return round((self.prompt_tokens * 3 + self.completion_tokens * 15) / 1_000_000, 6)


class PipelineMetrics(BaseModel):
    total_latency_ms: float = 0.0
    llm_calls: list[LLMCallMetric] = Field(default_factory=list)

    @computed_field
    @property
    def total_tokens(self) -> int:
        return sum(c.total_tokens for c in self.llm_calls)

    @computed_field
    @property
    def total_cost_usd(self) -> float:
        return round(sum(c.estimated_cost_usd for c in self.llm_calls), 6)


class RecommendationResult(BaseModel):
    contact_id: str
    contact_name: str
    signals_extracted: list[GiftSignal]
    signals_filtered_out: list[str]
    search_queries_used: list[str]
    products_considered: list[ProductCandidate]
    top_3_recommendations: list[GiftRecommendation]
    review_status: ReviewStatus = ReviewStatus.pending
    review_actions: list[ReviewAction] = Field(default_factory=list)
    pipeline_warnings: list[str] = Field(default_factory=list)
    low_signal_flag: bool = False
    stage_reasoning: dict[str, str] = Field(default_factory=dict)
    pipeline_metrics: Optional[PipelineMetrics] = None

import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

export interface ContactProfile {
  contact_id: string;
  name: string;
  linkedin_data: {
    headline?: string;
    summary?: string;
    current_company?: string;
    current_role?: string;
    industry?: string;
    skills: string[];
    recent_posts: string[];
    recent_comments: string[];
    engaged_topics: string[];
    education: string[];
    certifications: string[];
    volunteer_work: string[];
    honors_awards: string[];
    interests: string[];
  };
  constraints: {
    budget_min: number;
    budget_max: number;
    currency: string;
    country: string;
    occasion: string;
    relationship: string;
    avoid_categories: string[];
    preferences_noted?: string;
    tone?: "formal" | "warm" | "playful" | "concise" | "inspiring";
  };
}

export interface ProductCandidate {
  title: string;
  url: string;
  price: number;
  currency: string;
  seller: string;
  description: string;
  image_url?: string;
  in_budget: boolean;
  url_valid?: boolean;
  relevance_score: number;
}

export interface GiftRecommendation {
  rank: number;
  product: ProductCandidate;
  personalised_message: string;
  reasoning: string;
  confidence_score: number;
  risk_level: string;
  assumptions: string[];
  signals_matched: string[];
}

export interface LLMCallMetric {
  stage: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface PipelineMetrics {
  total_latency_ms: number;
  llm_calls: LLMCallMetric[];
  total_tokens: number;
  total_cost_usd: number;
}

export interface RecommendationResult {
  contact_id: string;
  contact_name: string;
  signals_extracted: Array<{ category: string; signal: string; strength: string; source: string }>;
  signals_filtered_out: string[];
  search_queries_used: string[];
  products_considered: ProductCandidate[];
  top_3_recommendations: GiftRecommendation[];
  review_status: string;
  review_actions: Array<{
    recommendation_rank: number;
    action: string;
    edited_message?: string;
    rejection_reason?: string;
  }>;
  pipeline_warnings: string[];
  low_signal_flag: boolean;
  stage_reasoning: Record<string, string>;
  pipeline_metrics?: PipelineMetrics;
}

export type StreamEvent =
  | { type: "thinking_token"; stage: string; text: string }
  | { type: "node_complete"; node: string; reasoning?: Record<string, string> }
  | { type: "cache_hit" }
  | { type: "result"; data: RecommendationResult }
  | { type: "error"; message: string }
  | { type: "llm_metrics"; stage: string; prompt_tokens: number; completion_tokens: number; latency_ms: number };

export const recommendationApi = {
  create: (contact: ContactProfile) =>
    api.post<RecommendationResult>("/recommend", contact).then((r) => r.data),

  stream: async (
    contact: ContactProfile,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const response = await fetch("/api/v1/recommend/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
      signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "Unknown error");
      throw new Error(text);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // skip malformed events
        }
      }
    }
  },

  get: (contactId: string) =>
    api.get<RecommendationResult>(`/recommend/${contactId}`).then((r) => r.data),

  submitAction: (
    contactId: string,
    action: { recommendation_rank: number; action: string; edited_message?: string; rejection_reason?: string }
  ) =>
    api.post<RecommendationResult>(`/review/${contactId}/action`, action).then((r) => r.data),

  regenerate: (contactId: string, rank: number) =>
    api.post<RecommendationResult>(`/review/${contactId}/regenerate/${rank}`).then((r) => r.data),

  createBulk: (contacts: ContactProfile[]) =>
    api.post<RecommendationResult[]>("/recommend/bulk", contacts).then((r) => r.data),
};

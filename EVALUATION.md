# Evaluation Note

## How I'd measure quality in production

### 1. Signal-to-gift relevance (automated)
For each recommendation, compute a **signal coverage score**: what fraction of the extracted strong/moderate signals are matched by the top 3 gifts. Target: ≥ 2 signals per gift, ≥ 1 strong signal per top pick. Tracked per pipeline run and aggregated as a weekly P50/P95.

### 2. Link validity rate (automated)
Fraction of recommended product URLs that return HTTP 200 at time of delivery. Target: > 95%. Anything below 80% triggers an alert — usually means SerpAPI is returning stale shopping results for that country/category. Logged per search query so bad query patterns are identifiable.

### 3. Budget adherence (automated)
Fraction of recommendations where `price` is within [budget_min, budget_max]. Failures here are a hard bug — the validation node should catch them. Tracked separately from confidence score.

### 4. Human approval rate (human-in-loop signal)
Fraction of recommendations approved without edit vs. rejected or regenerated. A high approval rate (> 70%) suggests the pipeline is calibrated. Track per occasion type and relationship type to find where it underperforms (e.g. "client gifts" likely need higher professionalism bar).

### 5. Message edit distance (proxy for message quality)
When a reviewer edits the personalised message rather than rejecting, measure the edit distance (normalized Levenshtein) between the original and edited message. Low edit distance = good first draft. High = the LLM missed the tone or relationship register. Used to tune the `generate_messages` prompt.

### 6. Confidence calibration (spot-check)
Periodically compare `confidence_score` to human ratings (1–5 scale after gifting). A well-calibrated system should show correlation: 0.8+ confidence gifts should land better than 0.5 confidence gifts. Measured monthly via post-gift survey.

---

## Key edge cases handled

| Edge case | Handling |
|---|---|
| Sparse LinkedIn profile | `low_signal_flag=true`, confidence capped at 0.65, human review prompted |
| No products in budget | Validation node widens to all in-budget regardless of URL status, warns |
| Search returns < 3 products | Pipeline retries search up to `MAX_SEARCH_RETRIES` times with same queries |
| Hallucinated product URL | HTTP HEAD validation marks `url_valid=false`, node filters these out first |
| Sensitive signal (religion/health/politics) | Rule-based pre-filter + LLM second-pass; filtered reasons returned for transparency |
| All products rejected by human | `/regenerate/{rank}` triggers a fresh LLM message; full re-run via POST /recommend |

## What I'd do with more time

1. **Persistence**: swap in-memory store for Redis or Postgres with proper contact/result schema
2. **Streaming**: stream pipeline stage events via SSE so the UI shows progress in real-time  
3. **Better search**: use Amazon PA API or Flipkart affiliate API for Indian market — richer price/availability data than SerpAPI shopping
4. **Embedding-based signal matching**: instead of asking the LLM to score relevance, embed signals and product descriptions and score cosine similarity — cheaper and more consistent
5. **Feedback loop**: store approved recommendations, retrain signal-to-query mapping based on what actually gets approved

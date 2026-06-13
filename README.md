# Hyper-Personalised Gift Recommendation Agent

An AI workflow that turns enriched LinkedIn contact data into ranked, purchasable gift recommendations — with real product links, personalised messages, and a human review step.

[![Demo Video](https://drive.google.com/thumbnail?id=1dYvDvGWAqFnc0KlVXEh-QG3YwxMRLpiR&sz=w1280)](https://drive.google.com/file/d/1dYvDvGWAqFnc0KlVXEh-QG3YwxMRLpiR/view?usp=drive_link)

---

## What was built

**All required features** plus all bonus items:

| Requirement | Status |
|---|---|
| Multi-step AI workflow (extract → search → rank → message → review) | ✅ |
| Signal extraction from posts, comments, experience, engagement | ✅ |
| Gift-safe signal filtering (sensitive attribute guardrails) | ✅ |
| Product search via SerpAPI (real purchasable links) | ✅ |
| Product validation (URL check, budget, country, relevance) | ✅ |
| Top 3 gift ranking with reasoning, confidence, risk | ✅ |
| Personalised message generation | ✅ |
| Human review (approve / reject / edit / regenerate) | ✅ |
| Multiple contacts support | ✅ |
| **Bonus:** LangGraph workflow with conditional retry loop | ✅ |
| **Bonus:** React UI for reviewing and editing recommendations | ✅ |
| **Bonus:** Real-time reasoning trace (streaming token-by-token) | ✅ |
| **Bonus:** Agent intermediate outputs visible in UI | ✅ |
| **Bonus:** Retry/fallback when search results are poor | ✅ |
| **Bonus:** Bulk upload flow | ✅ |
| **Bonus:** Five message tones (formal/warm/playful/concise/inspiring) | ✅ |
| **Bonus:** Cost, latency, token logging per LLM call | ✅ |
| **Bonus:** Langfuse distributed tracing | ✅ |
| **Bonus:** deepeval test suite | ✅ |

---

## Architecture

```
ContactProfile (JSON)
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LangGraph Pipeline (8 nodes)                    │
│                                                                  │
│  ingest → extract_signals → filter_signals → search_products    │
│                                                   │              │
│  assemble_result ← generate_messages ← rank_gifts │              │
│                                            ↑       ▼             │
│                              validate_products ← retry?          │
└─────────────────────────────────────────────────────────────────┘
```

| Node | What it does |
|---|---|
| `ingest` | Validate input, flag sparse profiles |
| `extract_signals` | LLM extracts 5–15 signals (strong / moderate / weak) |
| `filter_signals` | Rule-based + LLM removes religion, health, politics, gender, ethnicity |
| `search_products` | LLM writes queries → SerpAPI Google Shopping → deduplicate |
| `validate_products` | HTTP HEAD validates URLs, budget filter, LLM relevance score |
| `rank_gifts` | LLM picks top 3 with reasoning, confidence, risk, assumptions |
| `generate_messages` | LLM writes a personalised note per gift (tone-aware) |
| `assemble_result` | Compiles all intermediate outputs into final JSON |

**Retry loop:** if `validate_products` finds fewer than 3 valid products, the graph retries `search_products` with refined queries (up to `MAX_SEARCH_RETRIES` times).

---

## Stack

- **Backend:** Python · FastAPI · LangGraph
- **LLM:** Claude Sonnet 4.5 via LiteLLM proxy (OpenAI-compatible)
- **Product search:** SerpAPI — Google Shopping
- **Frontend:** React 18 · TypeScript · Vite
- **Streaming:** Server-Sent Events (SSE)
- **Tracing:** Langfuse v3
- **Evaluation:** deepeval + pytest

---

## Setup

**Requirements:** Python 3.9+, Node 18+, SerpAPI key (100 free/month at serpapi.com)

```bash
# 1. Clone
git clone https://github.com/Palak807/gift_recommedation_CS.git
cd gift_recommedation_CS

# 2. Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. Frontend
cd frontend && npm install && cd ..

# 4. Configure
cp .env.example .env
# Edit .env — add LITELLM_BASE_URL, LITELLM_API_KEY, SERP_API_KEY

# 5. Run
uvicorn backend.main:app --reload --port 8000   # terminal 1
cd frontend && npm run dev                       # terminal 2
```

Open **http://localhost:3000** · API docs at **http://localhost:8000/docs**

---

## Sample input / output

See `sample_data/sample_contact.json` and `sample_data/sample_output.json`.

The input matches the assignment schema (`name`, `linkedin_profile`, `relationship_context`, `gift_context`). The output includes `profile_signals`, `search_trace`, `recommended_gifts` with confidence/risk/assumptions, and `human_review` status — matching the assignment's expected output format.

---

## API

```
POST /api/v1/recommend/stream   # SSE stream — real-time reasoning + final result
POST /api/v1/recommend          # Blocking — returns RecommendationResult
POST /api/v1/recommend/bulk     # Array of contacts — runs pipeline per contact
POST /api/v1/review/{id}/action # approve | reject | edit | regenerate
```

---

## Guardrails

Two-layer signal filtering:
1. **Rule-based pre-filter** — blocks signals matching a keyword list (religion, health, politics, ethnicity, family status, gender)
2. **LLM second-pass** — catches subtler violations the rules miss (e.g. "recovering from injury" in a post)

Filtered signals are returned in the output for transparency. Low-signal profiles get `low_signal_flag=true`, confidence is capped at 0.65, and a warning is surfaced in the UI.

Product hallucination is prevented by HTTP HEAD validation — any URL that doesn't return 200 is excluded before ranking.

---

## Evaluation note

See `EVALUATION.md` for the full quality framework. Short version:

| Metric | How measured |
|---|---|
| Signal relevance | Fraction of extracted signals matched by top 3 gifts |
| Link validity | HTTP 200 rate on recommended URLs at delivery time |
| Budget adherence | All recommended prices within `[budget_min, budget_max]` — hard validation |
| Human approval rate | Approved-without-edit / total recommendations |
| Message quality | Levenshtein edit distance when reviewers edit messages |
| Confidence calibration | Correlation between `confidence_score` and post-gift survey ratings |

---

## Tradeoffs and future improvements

**Tradeoffs made:**
- SerpAPI returns shopping results that sometimes include out-of-stock or region-locked URLs — mitigated by HEAD validation but not eliminated
- LLM-based relevance scoring is expensive per-product; capped at 12 candidates per run
- In-memory result store — fine for a prototype, not production

**With more time:**
- Swap SerpAPI for Amazon PA API or Flipkart Affiliate API (richer Indian market data)
- Persist results in Postgres with proper contact/result schema
- Embedding-based signal-to-product matching (cheaper and more consistent than LLM scoring)
- Feedback loop: store approved recommendations, use them to tune signal extraction

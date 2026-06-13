# Gift Recommendation Agent

A hyper-personalised gift recommendation system that turns a LinkedIn profile into curated gift ideas — powered by Claude (via LiteLLM proxy), LangGraph, and a React UI with real-time streaming.

---

## Features

- **8-stage LangGraph pipeline** — signal extraction → filtering → product search → validation → ranking → message generation
- **Real-time streaming** — watch Claude reason through each stage character-by-character via SSE
- **Tone control** — five message tones: Formal / Warm / Playful / Concise / Inspiring
- **Bulk upload** — submit a JSON array of contacts and process all at once
- **Human review loop** — approve, reject, edit, or regenerate any recommendation
- **Cost & latency tracking** — token usage and USD cost per LLM call shown in the UI
- **Langfuse tracing** — full distributed trace per pipeline run (spans per node, generation per LLM call)
- **deepeval test suite** — automated quality tests for signal extraction, filtering, and end-to-end pipeline

---

## Architecture

```
ContactProfile (JSON)
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   LangGraph Pipeline (8 stages)                   │
│                                                                    │
│  ingest → extract_signals → filter_signals → search_products      │
│                                                   │               │
│  assemble_result ← generate_messages ← rank_gifts │               │
│                                            ↑       ▼              │
│                              validate_products ← retry?           │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
RecommendationResult  (top 3 gifts · signals · queries · metrics)
       │
       ▼
Human Review Loop  (approve / reject / edit / regenerate)
```

### Pipeline stages

| Stage | What it does |
|---|---|
| **ingest** | Validate input, detect sparse profiles |
| **extract_signals** | LLM extracts 5–15 gifting signals (strong / moderate / weak) from LinkedIn data |
| **filter_signals** | Rule-based + LLM filter removes religion, politics, health, gender, ethnicity signals |
| **search_products** | LLM writes targeted queries → SerpAPI Google Shopping → deduplicate |
| **validate_products** | HTTP HEAD checks URLs, budget filter, LLM relevance scoring |
| **rank_gifts** | LLM picks top 3 with reasoning, confidence score, risk level, assumptions |
| **generate_messages** | LLM writes a 2–3 sentence personalised gift note per recommendation |
| **assemble_result** | Collects all intermediate outputs and metrics into the final result |

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.9 · FastAPI · LangGraph |
| LLM | Claude Sonnet 4.5 via LiteLLM proxy (OpenAI-compatible) |
| Product search | SerpAPI — Google Shopping |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Streaming | Server-Sent Events (SSE) via FastAPI `StreamingResponse` |
| Observability | Langfuse v3 (distributed tracing) |
| Evaluation | deepeval + pytest-asyncio |

---

## Project structure

```
├── backend/
│   ├── main.py                  # FastAPI app, CORS, router mount
│   ├── config.py                # Pydantic settings (loads .env)
│   ├── api/
│   │   └── routes.py            # REST + SSE endpoints
│   ├── models/
│   │   ├── contact.py           # ContactProfile, GiftConstraints, MessageTone
│   │   ├── recommendation.py    # RecommendationResult, LLMCallMetric, PipelineMetrics
│   │   └── state.py             # LangGraph PipelineState
│   ├── pipeline/
│   │   ├── graph.py             # StateGraph definition + conditional edges
│   │   └── nodes/               # One file per pipeline stage
│   └── services/
│       ├── llm_service.py       # call_llm / call_llm_streaming + ReasoningStreamExtractor
│       ├── search_service.py    # SerpAPI wrapper
│       ├── validation_service.py# HTTP HEAD product URL checker
│       └── tracing.py           # Langfuse singleton + create_pipeline_trace
├── frontend/
│   └── src/
│       ├── App.tsx              # Main layout, stream handler, results view
│       ├── api/client.ts        # TypeScript API client + SSE stream
│       └── components/
│           ├── ContactForm.tsx  # JSON input, Quick Settings (budget + tone), bulk tab
│           ├── RecommendationCard.tsx
│           └── SignalBadges.tsx
├── tests/
│   ├── conftest.py              # deepeval config, SAMPLE_CONTACT fixture
│   └── test_pipeline.py        # 10 quality tests (GEval metrics)
├── sample_data/
│   ├── sample_contact.json      # Example: Arjun Mehta, EM @ Zepto
│   └── sample_output.json       # Expected output for the sample contact
├── .env.example                 # Environment variable template
├── requirements.txt
├── pytest.ini
└── EVALUATION.md               # Quality measurement framework (6 metrics)
```

---

## Quick start

### Prerequisites

- Python 3.9+
- Node.js 18+
- A SerpAPI key (100 free searches/month at [serpapi.com](https://serpapi.com))

### 1. Clone & install

```bash
git clone https://github.com/Palak807/gift_recommedation_CS.git
cd gift_recommedation_CS

# Backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
# LiteLLM proxy — provided by your org
LITELLM_BASE_URL=https://your-litellm-proxy.example.com
LITELLM_API_KEY=sk-...
LITELLM_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0

# Product search (required)
SERP_API_KEY=your_serpapi_key_here

# Langfuse observability (optional — traces disabled if omitted)
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

### 3. Run

```bash
# Terminal 1 — backend (port 8000)
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend (port 3000)
cd frontend && npm run dev
```

Open **http://localhost:3000**

API docs (Swagger): **http://localhost:8000/docs**

---

## API reference

### Single recommendation (streaming)

```http
POST /api/v1/recommend/stream
Content-Type: application/json

{ ...ContactProfile }
```

Returns an SSE stream of events:

| Event type | Payload | When |
|---|---|---|
| `thinking_token` | `{ stage, text }` | Claude generates each reasoning character |
| `node_complete` | `{ node, reasoning? }` | A pipeline stage finishes |
| `llm_metrics` | `{ stage, prompt_tokens, completion_tokens, latency_ms }` | After each LLM call |
| `result` | `{ data: RecommendationResult }` | Pipeline complete |
| `error` | `{ message }` | Pipeline failure |

### Single recommendation (blocking)

```http
POST /api/v1/recommend
```

Returns `RecommendationResult` after the full pipeline completes.

### Bulk recommendations

```http
POST /api/v1/recommend/bulk
Content-Type: application/json

[ { ...ContactProfile }, { ...ContactProfile }, ... ]
```

Returns `RecommendationResult[]` — runs pipeline sequentially per contact.

### Human review

```http
POST /api/v1/review/{contact_id}/action
{ "recommendation_rank": 1, "action": "approved" | "rejected" | "edited", "edited_message": "..." }

POST /api/v1/review/{contact_id}/regenerate/{rank}
```

---

## Input schema

See `sample_data/sample_contact.json` for a complete example.

```json
{
  "contact_id": "arjun_001",
  "name": "Arjun Mehta",
  "linkedin_data": {
    "headline": "Engineering Manager @ Zepto | Ultramarathon runner",
    "summary": "...",
    "current_role": "Engineering Manager",
    "current_company": "Zepto",
    "skills": ["Engineering Management", "System Design", "Python"],
    "recent_posts": ["Finished the Auroville Half-Marathon..."],
    "recent_comments": ["Been using Obsidian for 18 months..."],
    "engaged_topics": ["ultramarathon running", "systems thinking"],
    "education": ["IIT Bombay — B.Tech Computer Science"],
    "interests": ["Trail running", "Reading", "Zettelkasten"]
  },
  "constraints": {
    "budget_min": 2000,
    "budget_max": 8000,
    "currency": "INR",
    "country": "IN",
    "occasion": "Work anniversary — 5 years",
    "relationship": "colleague",
    "avoid_categories": ["alcohol", "food perishables"],
    "tone": "warm"
  }
}
```

**Tone options:** `formal` · `warm` (default) · `playful` · `concise` · `inspiring`

---

## Running tests

Tests make real LLM calls — allow ~2 minutes.

```bash
source .venv/bin/activate
pytest tests/ -v
```

Tests cover: signal specificity (GEval), no sensitive signals, safe signal preservation, tone effect on messages, end-to-end pipeline, stage reasoning captured, confidence scores.

---

## Observability

Every pipeline run creates a Langfuse trace:

```
Trace: gift_recommendation  (input: contact + occasion + tone)
  ├── Span: extract_signals     → Generation: litellm  (tokens + cost)
  ├── Span: filter_signals      → Generation: litellm
  ├── Span: search_products
  ├── Span: validate_products
  ├── Span: rank_gifts          → Generation: litellm
  └── Span: generate_messages   → Generation: litellm
  output: { recommendation_count, warning_count }
```

View traces at [us.cloud.langfuse.com](https://us.cloud.langfuse.com).

---

## Design decisions

**LiteLLM proxy over direct Anthropic SDK** — The proxy exposes an OpenAI-compatible API, keeping the backend provider-agnostic. Swapping models is a one-line env var change.

**LangGraph for the pipeline** — Each stage is a pure async function. LangGraph handles state accumulation with reducers and makes the retry loop (insufficient products → re-search) clean via conditional edges.

**Tool calling for structured output** — Claude's function-calling produces reliably valid JSON matching a schema. Each stage defines its own schema and gets typed output without regex parsing or retries.

**`asyncio.Queue` for streaming** — LangGraph's `astream` yields at node completion, not mid-node. Threading a queue through `RunnableConfig` lets nodes push reasoning tokens to the SSE generator in real time, while the pipeline graph stays unmodified.

**`@computed_field` on Pydantic metrics** — `total_tokens`, `estimated_cost_usd`, and `total_cost_usd` are derived values on `LLMCallMetric` / `PipelineMetrics`. Using Pydantic v2 `@computed_field` ensures they are included in `model_dump_json()` and sent over the wire correctly.

**Rule + LLM signal filtering** — Rules catch clear sensitive keywords instantly. The LLM second-pass catches subtler cases the rules miss. Double-layer defence reduces the risk of personally sensitive signals reaching the gift suggestion.

---

## Evaluation

See `EVALUATION.md` for the 6-metric quality framework: signal coverage, link validity, budget adherence, human approval rate, message edit distance, and confidence calibration.

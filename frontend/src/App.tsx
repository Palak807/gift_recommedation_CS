import React, { useState } from "react";
import ContactForm from "./components/ContactForm";
import RecommendationCard from "./components/RecommendationCard";
import SignalBadges from "./components/SignalBadges";
import { recommendationApi } from "./api/client";
import type { RecommendationResult, ContactProfile } from "./api/client";
import { AlertTriangle, ChevronRight, Search, Package, Sparkles, ShieldCheck, Brain } from "lucide-react";

const PIPELINE_STEPS = [
  { id: "ingest",           label: "Ingesting Profile",   desc: "Validating contact profile & gift constraints" },
  { id: "extract_signals",  label: "Signal Extraction",   desc: "Parsing LinkedIn data & interest markers" },
  { id: "filter_signals",   label: "Signal Filtering",    desc: "Removing sensitive & irrelevant signals" },
  { id: "search_products",  label: "Product Search",      desc: "Querying curated gift catalog" },
  { id: "validate_products",label: "URL Validation",      desc: "Verifying product links & pricing" },
  { id: "rank_gifts",       label: "AI Ranking",          desc: "Scoring by relevance & personalisation fit" },
  { id: "generate_messages",label: "Message Generation",  desc: "Writing personalised gift notes" },
  { id: "assemble_result",  label: "Assembling Results",  desc: "Compiling final recommendation set" },
];

const NODE_TO_STAGE: Record<string, number> = {
  ingest: 1,
  extract_signals: 2,
  filter_signals: 3,
  search_products: 4,
  validate_products: 5,
  increment_retry: 3,
  rank_gifts: 6,
  generate_messages: 7,
  assemble_result: 8,
};

const STAGE_REASONING_LABELS: Record<string, string> = {
  extract_signals:  "Signal Extraction",
  filter_signals:   "Signal Filtering",
  rank_gifts:       "Gift Ranking",
  generate_messages:"Message Generation",
};

const CARD_PALETTE = [
  { bg: "rgba(16,185,129,0.1)",   border: "rgba(16,185,129,0.28)",  text: "#6ee7b7" },
  { bg: "rgba(139,92,246,0.1)",   border: "rgba(139,92,246,0.28)",  text: "#c4b5fd" },
  { bg: "rgba(59,130,246,0.1)",   border: "rgba(59,130,246,0.28)",  text: "#93c5fd" },
  { bg: "rgba(245,158,11,0.1)",   border: "rgba(245,158,11,0.28)",  text: "#fde68a" },
  { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.26)",   text: "#fca5a5" },
  { bg: "rgba(99,102,241,0.1)",   border: "rgba(99,102,241,0.28)",  text: "#a5b4fc" },
];

/* ─── Bulk Results View ─── */
function BulkResultsView({ results, onClear }: { results: RecommendationResult[]; onClear: () => void }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Bulk Results</p>
          <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{results.length} contact{results.length !== 1 ? "s" : ""} processed</p>
        </div>
        <button onClick={onClear} style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.42)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          Clear
        </button>
      </div>
      <div style={{ maxHeight: 480, overflowY: "auto", padding: "8px 0" }}>
        {results.map((r, idx) => {
          const top = r.top_3_recommendations[0];
          const metrics = r.pipeline_metrics;
          return (
            <div key={r.contact_id ?? idx} style={{ padding: "12px 20px", borderBottom: idx < results.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,rgba(139,92,246,0.4),rgba(59,130,246,0.4))", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                      {r.contact_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{r.contact_name}</p>
                      <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.28)" }}>
                        {r.signals_extracted.length} signals · {r.top_3_recommendations.length} recommendations
                      </p>
                    </div>
                  </div>
                  {top && (
                    <div style={{ marginLeft: 36, marginBottom: 4 }}>
                      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Top: {top.product.title}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <div style={{ width: Math.round(top.confidence_score * 60), height: 3, borderRadius: 2, background: "linear-gradient(to right,rgba(139,92,246,0.7),rgba(167,139,250,0.9))" }} />
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{Math.round(top.confidence_score * 100)}% confidence</span>
                      </div>
                    </div>
                  )}
                  {r.pipeline_warnings.length > 0 && (
                    <div style={{ marginLeft: 36, display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                      <AlertTriangle size={10} style={{ color: "#fde68a", flexShrink: 0 }} />
                      <span style={{ fontSize: 10.5, color: "#fde68a" }}>{r.pipeline_warnings.length} warning{r.pipeline_warnings.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
                {metrics && (
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>{metrics.total_latency_ms.toLocaleString()}ms</p>
                    <p style={{ fontSize: 10, color: "rgba(167,139,250,0.6)" }}>${metrics.total_cost_usd.toFixed(4)}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



export default function App() {
  const [result, setResult]               = useState<RecommendationResult | null>(null);
  const [loading, setLoading]             = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError]                 = useState("");
  const [activeStage, setActiveStage]     = useState(0);
  const [currentNode, setCurrentNode]     = useState<string>("");
  const [liveReasoning, setLiveReasoning] = useState<Record<string, string>>({});
  const [streamingTokens, setStreamingTokens] = useState<Record<string, string>>({});
  const [showPanel, setShowPanel]         = useState<string | null>(null);
  const [bulkResults, setBulkResults]     = useState<RecommendationResult[]>([]);
  const [bulkLoading, setBulkLoading]     = useState(false);
  const [fromCache, setFromCache]         = useState(false);

  const handleSubmit = async (contact: ContactProfile) => {
    setLoading(true);
    setError("");
    setResult(null);
    setShowPanel(null);
    setActiveStage(0);
    setCurrentNode("ingest");
    setLiveReasoning({});
    setStreamingTokens({});
    setBulkResults([]);
    setFromCache(false);

    try {
      await recommendationApi.stream(contact, (event) => {
        if (event.type === "thinking_token") {
          setStreamingTokens((prev) => ({
            ...prev,
            [event.stage]: (prev[event.stage] ?? "") + event.text,
          }));
        } else if (event.type === "node_complete") {
          setCurrentNode(event.node);
          const nextStage = NODE_TO_STAGE[event.node];
          if (nextStage !== undefined) setActiveStage(nextStage);
          if (event.reasoning) {
            setLiveReasoning((prev) => ({ ...prev, ...event.reasoning }));
          }
        } else if (event.type === "cache_hit") {
          setFromCache(true);
          setActiveStage(8);
        } else if (event.type === "result") {
          setResult(event.data);
          setActiveStage(8);
        } else if (event.type === "error") {
          setError(event.message || "Pipeline failed.");
        }
      });
    } catch (e: any) {
      setError(e.message ?? "Pipeline failed. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSubmit = async (contacts: ContactProfile[]) => {
    setBulkLoading(true);
    setBulkResults([]);
    setError("");
    try {
      const data = await recommendationApi.createBulk(contacts);
      setBulkResults(data);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? "Bulk run failed.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleApprove = async (rank: number) => {
    if (!result) return;
    setActionLoading(rank);
    try {
      const updated = await recommendationApi.submitAction(result.contact_id, { recommendation_rank: rank, action: "approved" });
      setResult(updated);
    } finally { setActionLoading(null); }
  };

  const handleReject = async (rank: number, reason: string) => {
    if (!result) return;
    setActionLoading(rank);
    try {
      const updated = await recommendationApi.submitAction(result.contact_id, { recommendation_rank: rank, action: "rejected", rejection_reason: reason });
      setResult(updated);
    } finally { setActionLoading(null); }
  };

  const handleEdit = async (rank: number, message: string) => {
    if (!result) return;
    setActionLoading(rank);
    try {
      const updated = await recommendationApi.submitAction(result.contact_id, { recommendation_rank: rank, action: "edited", edited_message: message });
      setResult(updated);
    } finally { setActionLoading(null); }
  };

  const handleRegenerate = async (rank: number) => {
    if (!result) return;
    setActionLoading(rank);
    try {
      const updated = await recommendationApi.regenerate(result.contact_id, rank);
      setResult(updated);
    } finally { setActionLoading(null); }
  };

  const handleReset = () => {
    setResult(null);
    setError("");
    setActiveStage(0);
    setCurrentNode("");
    setLiveReasoning({});
    setStreamingTokens({});
    setBulkResults([]);
    setFromCache(false);
  };

  const getActionForRank = (rank: number) =>
    result?.review_actions.find((a) => a.recommendation_rank === rank)?.action;

  const initials = result
    ? result.contact_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "";

  const pct = Math.round((activeStage / 8) * 100);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", background: "#07070e" }}>

      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 65% 65% at 8% 50%,rgba(88,28,175,0.22) 0%,transparent 100%),radial-gradient(ellipse 50% 55% at 92% 12%,rgba(29,78,216,0.16) 0%,transparent 100%),#07070e" }} />
        <div style={{ position: "absolute", top: -240, left: -180, width: 760, height: 760, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,0.25) 0%,transparent 65%)", filter: "blur(90px)", animation: "orb1 24s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: -380, right: -220, width: 860, height: 860, borderRadius: "50%", background: "radial-gradient(circle,rgba(59,130,246,0.18) 0%,transparent 65%)", filter: "blur(100px)", animation: "orb2 30s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "50%", left: "58%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 65%)", filter: "blur(70px)", animation: "orb3 20s ease-in-out infinite", transform: "translate(-50%,-50%)" }} />
      </div>

      {/* Nav */}
      <nav style={{ position: "relative", zIndex: 20, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", backdropFilter: "blur(28px) saturate(200%)", WebkitBackdropFilter: "blur(28px) saturate(200%)", background: "rgba(7,7,14,0.85)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(140deg,#7c3aed 0%,#4338ca 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(124,58,237,0.5),inset 0 1px 0 rgba(255,255,255,0.18)", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7"/>
              <path d="M12 3c-1.5 0-3.5 1.5-3.5 5"/><path d="M12 3c1.5 0 3.5 1.5 3.5 5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.25 }}>Gift Agent</div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "1.8px", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>AI-Powered Recommendations</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {result && (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", padding: "4px 12px", borderRadius: 20, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)", color: "#6ee7b7" }}>
              ✓ Complete
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 8px rgba(34,211,238,0.85)" }} className="animate-blink" />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>Claude connected</span>
          </div>
        </div>
      </nav>

      {/* Main layout */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 14, padding: 16, height: "calc(100vh - 54px)", overflow: "hidden" }}>

        {/* LEFT PANEL */}
        <ContactForm onSubmit={handleSubmit} onBulkSubmit={handleBulkSubmit} loading={loading || bulkLoading} onReset={handleReset} hasResult={!!result} />

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Upload hero */}
          {!loading && !bulkLoading && !result && !error && bulkResults.length === 0 && <UploadHero />}

          {/* Error */}
          {error && !loading && !bulkLoading && (
            <div className="animate-fade-in" style={{ flex: 1, background: "rgba(255,255,255,0.045)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 18, padding: "32px 28px", display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={20} style={{ color: "#fca5a5" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>Pipeline Error</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{error}</p>
              </div>
            </div>
          )}

          {/* Bulk loading */}
          {bulkLoading && (
            <div className="animate-fade-in" style={{ flex: 1, background: "rgba(255,255,255,0.045)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "32px 28px", display: "flex", alignItems: "center", gap: 18 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1.2s linear infinite", flexShrink: 0 }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 3 }}>Running bulk pipeline…</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Processing all contacts in parallel</p>
              </div>
            </div>
          )}

          {/* Processing (single) */}
          {loading && <ProcessingView activeStage={activeStage} pct={pct} currentNode={currentNode} liveReasoning={liveReasoning} streamingTokens={streamingTokens} />}

          {/* Bulk Results */}
          {bulkResults.length > 0 && !loading && !bulkLoading && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <BulkResultsView results={bulkResults} onClear={() => setBulkResults([])} />
            </div>
          )}

          {/* Single Results */}
          {result && !loading && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 13 }}>

              {/* Profile bar */}
              <div style={{ background: "rgba(255,255,255,0.045)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "15px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)" }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,rgba(139,92,246,0.55),rgba(59,130,246,0.55))", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
                  {initials}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: -0.35, marginBottom: 2 }}>{result.contact_name}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.38)" }}>
                    {result.signals_extracted.length} signals · {result.search_queries_used.length} queries · {result.products_considered.length} products evaluated
                  </div>
                </div>
                {fromCache && (
                  <span style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.22)", fontSize: 10.5, color: "rgba(34,211,238,0.8)", fontWeight: 700, letterSpacing: "0.5px" }}>
                    ⚡ Cached
                  </span>
                )}
                <button onClick={handleReset} style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.42)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                  ↩ Reset
                </button>
              </div>

              {/* Recommendations header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, marginBottom: 2 }}>
                    {result.top_3_recommendations.length} Gift Recommendations
                  </h2>
                  <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)" }}>
                    Ranked by AI personalisation score · from {result.products_considered.length} candidates
                  </p>
                </div>
                <span style={{ padding: "5px 13px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)", fontSize: 11.5, color: "#6ee7b7", fontWeight: 700 }}>
                  ✓ Pipeline Complete
                </span>
              </div>

              {/* No recommendations */}
              {result.top_3_recommendations.length === 0 && (
                <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 16, padding: "48px 32px", textAlign: "center" }}>
                  <AlertTriangle size={28} style={{ color: "#fde68a", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>No recommendations generated</p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", maxWidth: 360, margin: "0 auto" }}>Not enough products found within budget. Try widening the budget range or verifying your SerpAPI key.</p>
                </div>
              )}

              {/* Gift cards grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 11 }}>
                {result.top_3_recommendations.map((rec, idx) => {
                  const mp = CARD_PALETTE[idx % CARD_PALETTE.length];
                  return (
                    <RecommendationCard
                      key={rec.rank}
                      rec={rec}
                      contactId={result.contact_id}
                      matchPalette={mp}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onEdit={handleEdit}
                      onRegenerate={handleRegenerate}
                      actionTaken={getActionForRank(rec.rank)}
                      loading={actionLoading === rec.rank}
                      animDelay={idx}
                    />
                  );
                })}
              </div>

              {/* LLM Reasoning Trace */}
              {result.stage_reasoning && Object.keys(result.stage_reasoning).length > 0 && (
                <div style={{ background: "rgba(139,92,246,0.04)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(139,92,246,0.18)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(139,92,246,0.12)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Brain size={13} style={{ color: "rgba(167,139,250,0.9)" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", color: "rgba(167,139,250,0.7)" }}>LLM Reasoning Trace</p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>Why the agent made each decision</p>
                    </div>
                  </div>
                  {Object.entries(result.stage_reasoning).map(([stageKey, reasoning], idx, arr) => {
                    const label = STAGE_REASONING_LABELS[stageKey] ?? stageKey;
                    const isLast = idx === arr.length - 1;
                    return (
                      <ReasoningRow key={stageKey} label={label} reasoning={reasoning} isLast={isLast}
                        open={showPanel === "reasoning_" + stageKey}
                        onToggle={() => setShowPanel(showPanel === "reasoning_" + stageKey ? null : "reasoning_" + stageKey)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Pipeline Insights */}
              <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>Pipeline Insights</p>
                </div>

                {/* Signals */}
                <InsightRow
                  icon={<Sparkles size={13} style={{ color: "rgba(167,139,250,0.9)" }} />}
                  iconBg="rgba(139,92,246,0.12)"
                  iconBorder="rgba(139,92,246,0.25)"
                  label="Signals Extracted"
                  count={`${result.signals_extracted.length} signals found`}
                  open={showPanel === "signals"}
                  onToggle={() => setShowPanel(showPanel === "signals" ? null : "signals")}
                >
                  <SignalBadges signals={result.signals_extracted} />
                  {result.signals_filtered_out.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 8 }}>
                        Filtered Out ({result.signals_filtered_out.length})
                      </p>
                      {result.signals_filtered_out.slice(0, 4).map((r, i) => (
                        <p key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                          <ShieldCheck size={10} style={{ marginTop: 2, flexShrink: 0 }} /> {r}
                        </p>
                      ))}
                    </div>
                  )}
                </InsightRow>

                {/* Search queries */}
                <InsightRow
                  icon={<Search size={13} style={{ color: "rgba(147,197,253,0.9)" }} />}
                  iconBg="rgba(59,130,246,0.1)"
                  iconBorder="rgba(59,130,246,0.22)"
                  label="Search Queries"
                  count={`${result.search_queries_used.length} queries run`}
                  open={showPanel === "queries"}
                  onToggle={() => setShowPanel(showPanel === "queries" ? null : "queries")}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {result.search_queries_used.map((q, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "monospace", marginTop: 1, flexShrink: 0, minWidth: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>{q}</p>
                      </div>
                    ))}
                  </div>
                </InsightRow>

                {/* Products */}
                <InsightRow
                  icon={<Package size={13} style={{ color: "rgba(110,231,183,0.9)" }} />}
                  iconBg="rgba(16,185,129,0.1)"
                  iconBorder="rgba(16,185,129,0.22)"
                  label="Products Considered"
                  count={`${result.products_considered.length} evaluated`}
                  open={showPanel === "products"}
                  onToggle={() => setShowPanel(showPanel === "products" ? null : "products")}
                  last
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {result.products_considered.slice(0, 8).map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: i < 7 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{p.seller}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{p.currency}{p.price.toLocaleString()}</span>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.relevance_score >= 0.7 ? "#10b981" : p.relevance_score >= 0.4 ? "#f59e0b" : "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </InsightRow>
              </div>

              {/* Warnings */}
              {(result.pipeline_warnings.length > 0 || result.low_signal_flag) && (
                <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 14, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.low_signal_flag && (
                    <p style={{ fontSize: 11.5, color: "#fde68a", display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle size={11} /> Low signal profile — confidence is capped
                    </p>
                  )}
                  {result.pipeline_warnings.map((w, i) => (
                    <p key={i} style={{ fontSize: 11.5, color: "#fde68a", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} /> {w}
                    </p>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Upload Hero ─── */
function UploadHero() {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,0.045)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 48px", textAlign: "center", minHeight: "calc(100vh - 54px - 32px)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)" }}>
      <div style={{ position: "relative", marginBottom: 28 }}>
        <div style={{ width: 86, height: 86, borderRadius: 22, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(139,92,246,0.22),0 0 120px rgba(139,92,246,0.1)" }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7"/>
            <path d="M12 3c-1.5 0-3.5 1.5-3.5 5"/><path d="M12 3c1.5 0 3.5 1.5 3.5 5"/>
          </svg>
        </div>
        <div style={{ position: "absolute", top: -10, right: -10, width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#4338ca)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(124,58,237,0.65)" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
        </div>
      </div>

      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.9, marginBottom: 11, background: "linear-gradient(140deg,rgba(255,255,255,0.97) 20%,rgba(196,181,253,0.88) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1.1 }}>
        Personalised Gift Discovery
      </h1>

      <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.36)", maxWidth: 440, lineHeight: 1.7, marginBottom: 44 }}>
        Upload a LinkedIn-enriched contact profile to run the 8-stage AI recommendation pipeline and receive perfectly curated gift ideas — ranked by personalisation score.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
        {["SIGNALS","ANALYSE","CONTEXT","SEARCH","FILTER","RANK","REVIEW","CURATE"].map((label, i) => (
          <React.Fragment key={label}>
            <span style={{ padding: "5px 11px", borderRadius: 20, background: i === 0 ? "rgba(139,92,246,0.13)" : "rgba(255,255,255,0.03)", border: `1px solid ${i === 0 ? "rgba(139,92,246,0.28)" : "rgba(255,255,255,0.06)"}`, fontSize: 10, fontWeight: 700, color: i === 0 ? "rgba(167,139,250,0.85)" : "rgba(255,255,255,0.28)", letterSpacing: "0.7px" }}>
              {label}
            </span>
            {i < 7 && <span style={{ color: "rgba(255,255,255,0.14)", fontSize: 11 }}>›</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ─── Processing View ─── */
function ProcessingView({ activeStage, pct, currentNode, liveReasoning, streamingTokens }: {
  activeStage: number; pct: number;
  currentNode: string;
  liveReasoning: Record<string, string>;
  streamingTokens: Record<string, string>;
}) {
  const steps = PIPELINE_STEPS;
  const activeStep = steps[Math.min(activeStage, 7)];
  const latestReasoning = Object.entries(liveReasoning).pop();

  return (
    <div className="animate-fade-in" style={{ flex: 1, background: "rgba(255,255,255,0.045)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "26px 28px", display: "flex", flexDirection: "column", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)" }}>
      {/* Header */}
      <div style={{ marginBottom: 22, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 13 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, marginBottom: 3 }}>Analysing Profile</h2>
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)" }}>
              Stage {Math.min(activeStage + 1, 8)} of 8 · {activeStep?.label ?? "Processing"}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1.5, color: "rgba(167,139,250,0.95)", lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2, letterSpacing: "0.5px" }}>COMPLETE</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(to right,#6d28d9,#8b5cf6,#a78bfa)", borderRadius: 2, transition: "width 0.55s cubic-bezier(0.4,0,0.2,1)", boxShadow: "0 0 12px rgba(139,92,246,0.55)" }} />
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {steps.map((step, i) => {
          const done    = i < activeStage;
          const active  = i === activeStage;
          const pending = i > activeStage;
          const last    = i === steps.length - 1;
          const reasoning = liveReasoning[step.id];
          return (
            <div key={step.id} style={{ display: "flex", gap: 14, opacity: pending ? 0.35 : 1, transition: "opacity 0.35s ease" }}>
              {/* Timeline */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 26, flexShrink: 0 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, zIndex: 1, background: done ? "rgba(124,58,237,0.9)" : active ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.05)", border: done ? "1.5px solid rgba(124,58,237,0.55)" : active ? "1.5px solid rgba(167,139,250,0.85)" : "1.5px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: active ? "0 0 16px rgba(167,139,250,0.5)" : done ? "0 0 10px rgba(124,58,237,0.4)" : "none", transition: "all 0.35s ease" }}>
                  {done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                  {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(167,139,250,0.95)" }} className="animate-blink" />}
                  {pending && <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)" }}>{i + 1}</span>}
                </div>
                {!last && <div style={{ width: 1.5, flex: 1, minHeight: 14, background: done ? "linear-gradient(to bottom,rgba(124,58,237,0.65),rgba(124,58,237,0.15))" : "rgba(255,255,255,0.05)", margin: "4px 0", transition: "background 0.4s ease" }} />}
              </div>
              {/* Content */}
              <div style={{ flex: 1, paddingBottom: last ? 4 : reasoning ? 12 : 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: pending ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.92)", letterSpacing: -0.2 }}>{step.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: done ? "rgba(167,139,250,0.85)" : active ? "rgba(251,191,36,0.9)" : "rgba(255,255,255,0.18)", padding: "2px 9px", borderRadius: 20, background: done ? "rgba(124,58,237,0.12)" : active ? "rgba(251,191,36,0.1)" : "transparent", border: done ? "1px solid rgba(124,58,237,0.24)" : active ? "1px solid rgba(251,191,36,0.25)" : "1px solid transparent" }}>
                    {done ? "✓ Done" : active ? "● Running" : "Queued"}
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.45 }}>{step.desc}</p>
                {/* Live streaming reasoning while stage is active */}
                {active && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)" }}>
                    {streamingTokens[step.id] ? (
                      <p style={{ fontSize: 11, color: "rgba(167,139,250,0.85)", lineHeight: 1.65, fontStyle: "italic", whiteSpace: "pre-wrap" }}>
                        {streamingTokens[step.id]}
                        <span style={{ display: "inline-block", width: 7, height: 12, background: "rgba(167,139,250,0.7)", marginLeft: 2, verticalAlign: "text-bottom", borderRadius: 1 }} className="animate-blink" />
                      </p>
                    ) : (
                      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(167,139,250,0.6)", flexShrink: 0 }} className="animate-blink" />
                        <p style={{ fontSize: 11, color: "rgba(167,139,250,0.5)" }}>Claude is thinking…</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Final reasoning once stage completes */}
                {done && reasoning && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.14)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Brain size={11} style={{ color: "rgba(167,139,250,0.6)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 11, color: "rgba(167,139,250,0.75)", lineHeight: 1.55, fontStyle: "italic" }}>{reasoning}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active streaming panel pinned at bottom — shows live tokens for the running stage */}
      {(() => {
        const activeStep = steps[Math.min(activeStage, 7)];
        const liveText = activeStep ? streamingTokens[activeStep.id] : "";
        if (!liveText && !latestReasoning) return null;
        const displayText = liveText || (latestReasoning ? latestReasoning[1] : "");
        const label = liveText
          ? (STAGE_REASONING_LABELS[activeStep?.id ?? ""] ?? activeStep?.label ?? "")
          : (latestReasoning ? (STAGE_REASONING_LABELS[latestReasoning[0]] ?? latestReasoning[0]) : "");
        return (
          <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Brain size={13} style={{ color: "rgba(167,139,250,0.85)", flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.5)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>
                {liveText ? "Live · " : "Latest · "}{label}
              </p>
              <p style={{ fontSize: 11.5, color: "rgba(167,139,250,0.85)", lineHeight: 1.65, fontStyle: "italic", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {displayText}
                {liveText && (
                  <span style={{ display: "inline-block", width: 7, height: 13, background: "rgba(167,139,250,0.7)", marginLeft: 2, verticalAlign: "text-bottom", borderRadius: 1 }} className="animate-blink" />
                )}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Reasoning Row ─── */
function ReasoningRow({ label, reasoning, isLast, open, onToggle }: {
  label: string; reasoning: string; isLast: boolean;
  open: boolean; onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid rgba(139,92,246,0.1)" }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "transparent", border: "none", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(167,139,250,0.6)", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>{label}</span>
        </div>
        <ChevronRight size={13} style={{ color: "rgba(167,139,250,0.4)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }} />
      </button>
      {open && (
        <div className="animate-fade-in" style={{ padding: "0 20px 14px 37px" }}>
          <p style={{ fontSize: 12, color: "rgba(167,139,250,0.75)", lineHeight: 1.7, fontStyle: "italic" }}>{reasoning}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Insight Row ─── */
function InsightRow({ icon, iconBg, iconBorder, label, count, open, onToggle, children, last }: {
  icon: React.ReactNode; iconBg: string; iconBorder: string;
  label: string; count: string;
  open: boolean; onToggle: () => void;
  children: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{ borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "transparent", border: "none", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, border: `1px solid ${iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {icon}
          </div>
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{label}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{count}</p>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.25)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }} />
      </button>
      {open && (
        <div className="animate-fade-in" style={{ padding: "0 20px 16px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

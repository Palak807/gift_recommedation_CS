import React, { useState, useRef, useEffect } from "react";
import type { ContactProfile } from "../api/client";

interface Props {
  onSubmit: (contact: ContactProfile) => void;
  onBulkSubmit?: (contacts: ContactProfile[]) => void;
  onReset: () => void;
  loading: boolean;
  hasResult: boolean;
}

const SAMPLE_CONTACT: ContactProfile = {
  contact_id: "contact_001",
  name: "Arjun Mehta",
  linkedin_data: {
    headline: "Engineering Manager @ Zepto | Ex-Flipkart | Building high-velocity teams",
    summary: "I've spent 8 years scaling engineering teams in India's fast-commerce space. Avid ultramarathon runner — completed Ladakh 50K. I read voraciously (systems thinking, behavioural economics). Geeking out on productivity tooling and async workflows.",
    current_company: "Zepto",
    current_role: "Engineering Manager",
    industry: "Technology",
    skills: ["Engineering Management","System Design","Distributed Systems","Python","Running","Stoicism","Deep Work"],
    recent_posts: [
      "Just crossed the finish line at the Auroville Half-Marathon. 6 months of training, a lot of 5am runs, and an embarrassing number of energy gels.",
      "Finished The Almanack of Naval Ravikant. The chapter on specific knowledge is reshaping how I hire.",
      "Hot take: async-first culture is the biggest productivity unlock for distributed engineering teams and almost nobody does it right.",
    ],
    recent_comments: ["Been using Obsidian for 18 months now. The bi-directional links are genuinely useful once your note graph gets large enough."],
    engaged_topics: ["ultramarathon running","systems thinking","productivity tooling","stoic philosophy","async work culture"],
    education: ["IIT Bombay — B.Tech Computer Science (2012-2016)"],
    certifications: [],
    volunteer_work: ["Mentors first-gen college students at iMentor India"],
    honors_awards: ["Flipkart Outstanding Engineer 2019"],
    interests: ["Trail running","Reading","Zettelkasten","Endurance sports"],
  },
  constraints: {
    budget_min: 2000,
    budget_max: 8000,
    currency: "INR",
    country: "IN",
    occasion: "Work anniversary — 5 years",
    relationship: "colleague",
    avoid_categories: ["alcohol","food perishables"],
    preferences_noted: "Travels light, values quality over quantity",
  },
};

const FIELD_TAGS = ["LinkedIn URL","Interests","Budget","Occasion","Relationship","Exclusions","Constraints"];

const TONE_OPTIONS = [
  { value: "formal",    label: "Formal" },
  { value: "warm",      label: "Warm" },
  { value: "playful",   label: "Playful" },
  { value: "concise",   label: "Concise" },
  { value: "inspiring", label: "Inspiring" },
];

export default function ContactForm({ onSubmit, onBulkSubmit, onReset, loading, hasResult }: Props) {
  const [mode, setMode]               = useState<"single" | "bulk">("single");
  const [jsonText, setJsonText]       = useState("");
  const [bulkText, setBulkText]       = useState("");
  const [parseError, setParseError]   = useState("");
  const [isDragging, setIsDragging]   = useState(false);
  const [budgetMin, setBudgetMin]     = useState("");
  const [budgetMax, setBudgetMax]     = useState("");
  const [tone, setTone]               = useState("warm");
  const fileRef = useRef<HTMLInputElement>(null);

  const hasContent = mode === "single" ? jsonText.trim().length > 0 : bulkText.trim().length > 0;

  // Auto-populate budget from parsed JSON
  useEffect(() => {
    if (mode !== "single" || !jsonText.trim()) return;
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed?.constraints?.budget_min !== undefined) setBudgetMin(String(parsed.constraints.budget_min));
      if (parsed?.constraints?.budget_max !== undefined) setBudgetMax(String(parsed.constraints.budget_max));
    } catch {
      // not valid JSON yet, ignore
    }
  }, [jsonText, mode]);

  // Count contacts in bulk mode
  const bulkCount = (() => {
    if (mode !== "bulk") return 0;
    try {
      const arr = JSON.parse(bulkText);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  })();

  const handleSubmit = () => {
    setParseError("");
    if (mode === "bulk") {
      try {
        const arr = JSON.parse(bulkText);
        if (!Array.isArray(arr)) { setParseError("Bulk input must be a JSON array [{...}, {...}]"); return; }
        onBulkSubmit?.(arr as ContactProfile[]);
      } catch {
        setParseError("Invalid JSON array — check formatting");
      }
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      // Merge quick settings into constraints
      const updated = {
        ...parsed,
        constraints: {
          ...parsed.constraints,
          ...(budgetMin !== "" ? { budget_min: Number(budgetMin) } : {}),
          ...(budgetMax !== "" ? { budget_max: Number(budgetMax) } : {}),
          tone: tone as ContactProfile["constraints"]["tone"],
        },
      };
      onSubmit(updated);
    } catch {
      setParseError("Invalid JSON — check formatting");
    }
  };

  const loadSample = () => {
    setJsonText(JSON.stringify(SAMPLE_CONTACT, null, 2));
    setParseError("");
  };

  const clearInput = () => {
    if (mode === "single") { setJsonText(""); setBudgetMin(""); setBudgetMax(""); }
    else setBulkText("");
    setParseError("");
    onReset();
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        if (mode === "single") { setJsonText(text); }
        else { setBulkText(text); }
        setParseError("");
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const activeText = mode === "single" ? jsonText : bulkText;
  const setActiveText = mode === "single" ? setJsonText : setBulkText;

  // Derived: is single-mode JSON valid enough to show quick settings?
  const showQuickSettings = mode === "single" && jsonText.trim().length > 0;

  return (
    <div style={{ width: 372, flexShrink: 0, background: "rgba(255,255,255,0.045)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", overflowY: "auto", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 40px 80px rgba(0,0,0,0.35)" }}>

      {/* Panel header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>Contact Profile</div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.32)", marginTop: 1 }}>LinkedIn-enriched JSON with gift constraints</div>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 4 }}>
        {(["single", "bulk"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setParseError(""); }}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: 7,
              background: mode === m ? "rgba(139,92,246,0.25)" : "transparent",
              border: mode === m ? "1px solid rgba(139,92,246,0.45)" : "1px solid transparent",
              color: mode === m ? "rgba(167,139,250,0.95)" : "rgba(255,255,255,0.38)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              letterSpacing: 0.2,
            }}
          >
            {m === "single" ? "Single" : "Bulk"}
          </button>
        ))}
      </div>

      {/* Drop zone / Editor */}
      {!hasContent ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{ border: `1.5px dashed ${isDragging ? "rgba(167,139,250,0.7)" : "rgba(139,92,246,0.35)"}`, borderRadius: 13, padding: "28px 16px", textAlign: "center", cursor: "pointer", background: isDragging ? "rgba(139,92,246,0.1)" : "rgba(139,92,246,0.035)", marginBottom: 10, transition: "all 0.2s ease" }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 11px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.88)" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(167,139,250,0.9)", marginBottom: 3 }}>Drop a JSON file or click to upload</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.26)" }}>
            {mode === "bulk" ? "Array format: [{...}, {...}]" : "or use the sample profile below"}
          </div>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileInput} style={{ display: "none" }} />
        </div>
      ) : (
        <div style={{ position: "relative", marginBottom: 10 }}>
          <textarea
            value={activeText}
            onChange={(e) => { setActiveText(e.target.value); setParseError(""); }}
            rows={12}
            spellCheck={false}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.75)", resize: "none", transition: "border-color 0.2s ease", outline: "none" }}
            placeholder={mode === "bulk" ? "Paste JSON array: [{...}, {...}]" : "Paste contact JSON here..."}
          />
          <button
            onClick={clearInput}
            style={{ position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            title="Clear"
          >
            ✕
          </button>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <p style={{ fontSize: 11.5, color: "#fca5a5", marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8 }}>{parseError}</p>
      )}

      {/* Quick Settings — only in single mode when JSON is loaded */}
      {showQuickSettings && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          {/* Budget */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>Budget</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", marginBottom: 3 }}>Min ₹</div>
                <input
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 7, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", marginBottom: 3 }}>Max ₹</div>
                <input
                  type="number"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 7, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                />
              </div>
            </div>
          </div>

          {/* Tone selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>Tone</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {TONE_OPTIONS.map((opt) => {
                const active = tone === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTone(opt.value)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 7,
                      background: active ? "rgba(139,92,246,0.22)" : "rgba(255,255,255,0.04)",
                      border: active ? "1px solid rgba(139,92,246,0.55)" : "1px solid rgba(255,255,255,0.08)",
                      color: active ? "rgba(167,139,250,0.95)" : "rgba(255,255,255,0.42)",
                      fontSize: 11.5,
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                      boxShadow: active ? "0 0 10px rgba(139,92,246,0.25)" : "none",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.8px" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
      </div>

      {/* Load sample button (single mode only) */}
      {mode === "single" && (
        <button
          onClick={loadSample}
          disabled={loading}
          style={{ width: "100%", padding: "11px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.6)", fontSize: 12.5, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", marginBottom: 14, transition: "all 0.15s", opacity: loading ? 0.5 : 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Load sample profile
        </button>
      )}

      {/* Generate / Bulk button (when JSON is loaded) */}
      {hasContent && (
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: "100%", padding: "12px", borderRadius: 11, background: loading ? "rgba(109,40,217,0.3)" : "linear-gradient(135deg,rgba(109,40,217,0.85),rgba(79,70,229,0.85))", border: "1px solid rgba(139,92,246,0.45)", color: "rgba(255,255,255,0.95)", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontFamily: "inherit", marginBottom: 14, transition: "all 0.15s", boxShadow: loading ? "none" : "0 0 24px rgba(124,58,237,0.35)", letterSpacing: 0.2 }}
        >
          {loading ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1.2s linear infinite" }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
              Running pipeline…
            </>
          ) : mode === "bulk" ? (
            <>Run Bulk ({bulkCount} contact{bulkCount !== 1 ? "s" : ""}) <span style={{ fontSize: 15 }}>→</span></>
          ) : (
            <>Generate Recommendations <span style={{ fontSize: 15 }}>→</span></>
          )}
        </button>
      )}

      {/* Field tags */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 9 }}>Expected Fields</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FIELD_TAGS.map((tag) => (
            <span key={tag} style={{ padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 500 }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Bottom status */}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(139,92,246,0.55)", flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.22)" }}>Processed locally · No data stored</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(59,130,246,0.55)", flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.22)" }}>Supports LinkedIn-exported JSON format</span>
        </div>
      </div>
    </div>
  );
}

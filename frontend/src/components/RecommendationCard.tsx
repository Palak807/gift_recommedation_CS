import React, { useState } from "react";
import { Check, X, RefreshCw, Pencil, ExternalLink, ChevronDown, ChevronUp, AlertTriangle, ShieldCheck } from "lucide-react";
import type { GiftRecommendation } from "../api/client";

interface MatchPalette { bg: string; border: string; text: string; }

interface Props {
  rec: GiftRecommendation;
  contactId: string;
  matchPalette: MatchPalette;
  onApprove: (rank: number) => void;
  onReject: (rank: number, reason: string) => void;
  onEdit: (rank: number, message: string) => void;
  onRegenerate: (rank: number) => void;
  actionTaken?: string;
  loading?: boolean;
  animDelay: number;
}

const RANK_ACCENT: Record<number, string> = {
  1: "linear-gradient(90deg,rgba(124,58,237,0.8),rgba(79,70,229,0.6))",
  2: "linear-gradient(90deg,rgba(59,130,246,0.7),rgba(99,102,241,0.5))",
  3: "linear-gradient(90deg,rgba(16,185,129,0.7),rgba(20,184,166,0.5))",
};

function categoryFromRec(rec: GiftRecommendation): string {
  if (rec.signals_matched.length > 0) {
    const s = rec.signals_matched[0];
    if (s.toLowerCase().includes("fit") || s.toLowerCase().includes("sport") || s.toLowerCase().includes("run")) return "Wellness & Sport";
    if (s.toLowerCase().includes("tech") || s.toLowerCase().includes("prod")) return "Tech & Productivity";
    if (s.toLowerCase().includes("read") || s.toLowerCase().includes("book") || s.toLowerCase().includes("learn")) return "Books & Learning";
    if (s.toLowerCase().includes("creat") || s.toLowerCase().includes("art") || s.toLowerCase().includes("photo")) return "Creative";
    if (s.toLowerCase().includes("audio") || s.toLowerCase().includes("music")) return "Audio";
    if (s.toLowerCase().includes("travel") || s.toLowerCase().includes("outdoor")) return "Travel & Outdoor";
  }
  return "Lifestyle";
}

export default function RecommendationCard({ rec, matchPalette: mp, onApprove, onReject, onEdit, onRegenerate, actionTaken, loading, animDelay }: Props) {
  const [expanded, setExpanded]           = useState(false);
  const [editMode, setEditMode]           = useState(false);
  const [editedMsg, setEditedMsg]         = useState(rec.personalised_message);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason]   = useState("");

  const confidence = Math.round(rec.confidence_score * 100);
  const category   = categoryFromRec(rec);
  const priceLabel = rec.product.currency === "INR"
    ? `₹${rec.product.price.toLocaleString("en-IN")}`
    : `${rec.product.currency} ${rec.product.price.toLocaleString()}`;

  const accentBar = RANK_ACCENT[rec.rank] ?? RANK_ACCENT[3];

  const cardBorder = actionTaken === "approved"
    ? "rgba(16,185,129,0.35)"
    : actionTaken === "rejected"
      ? "rgba(239,68,68,0.25)"
      : actionTaken === "edited"
        ? "rgba(59,130,246,0.3)"
        : "rgba(255,255,255,0.08)";

  return (
    <div className="animate-card-in" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: `1px solid ${cardBorder}`, borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", animationDelay: `${animDelay * 0.07}s`, opacity: actionTaken === "rejected" ? 0.5 : 1, transition: "opacity 0.3s ease" }}>

      {/* Top accent bar */}
      <div style={{ height: 3, borderRadius: "16px 16px 0 0", background: accentBar }} />

      {/* Card body */}
      <div style={{ padding: "18px 18px 0" }}>

        {/* Category + match */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.9px", textTransform: "uppercase" }}>{category}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 9px", borderRadius: 20, background: mp.bg, border: `1px solid ${mp.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: mp.text }}>{confidence}%</span>
            <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", marginLeft: 1 }}>match</span>
          </div>
        </div>

        {/* Name + seller */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: "rgba(255,255,255,0.93)", marginBottom: 2, lineHeight: 1.25 }}>{rec.product.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>{rec.product.seller}</span>
            {rec.product.url_valid && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#6ee7b7", fontWeight: 600 }}>
                <ShieldCheck size={9} /> Verified
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.7, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>{priceLabel}</div>

        {/* Reasoning */}
        <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.36)", lineHeight: 1.55, marginBottom: 12 }}>{rec.reasoning}</p>

        {/* Tags + view link */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {rec.signals_matched.slice(0, 3).map((t) => (
              <span key={t} style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{t}</span>
            ))}
          </div>
          <a href={rec.product.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, background: "linear-gradient(135deg,rgba(109,40,217,0.6),rgba(79,70,229,0.6))", border: "1px solid rgba(139,92,246,0.38)", backdropFilter: "blur(8px)", color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 700, textDecoration: "none", letterSpacing: 0.2, flexShrink: 0 }}>
            View Gift <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Gift message section */}
      <div style={{ padding: "0 18px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 0, paddingTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>Gift Message</span>
          {!editMode && !actionTaken && (
            <button onClick={() => setEditMode(true)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "rgba(255,255,255,0.25)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              <Pencil size={10} /> Edit
            </button>
          )}
        </div>
        {editMode ? (
          <div>
            <textarea
              value={editedMsg}
              onChange={(e) => setEditedMsg(e.target.value)}
              rows={3}
              style={{ width: "100%", fontFamily: "inherit", fontSize: 12.5, border: "1px solid rgba(139,92,246,0.35)", borderRadius: 10, padding: "10px 12px", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.8)", resize: "none", outline: "none", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { onEdit(rec.rank, editedMsg); setEditMode(false); }} style={{ flex: 1, padding: "7px", borderRadius: 9, background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.4)", color: "rgba(167,139,250,0.95)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save changes</button>
              <button onClick={() => { setEditMode(false); setEditedMsg(rec.personalised_message); }} style={{ padding: "7px 14px", borderRadius: 9, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, padding: "10px 12px", background: "rgba(0,0,0,0.18)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            {rec.personalised_message || <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>No message generated</span>}
          </p>
        )}
      </div>

      {/* Expandable details */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setExpanded(!expanded)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", fontSize: 11, color: "rgba(255,255,255,0.25)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          <span>Details & Assumptions</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {expanded && (
          <div className="animate-fade-in" style={{ padding: "0 18px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
            {rec.signals_matched.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>Signals Matched</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {rec.signals_matched.map((s) => (
                    <span key={s} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "rgba(167,139,250,0.85)", fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
            {rec.assumptions.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <AlertTriangle size={10} /> Assumptions
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {rec.assumptions.map((a) => (
                    <p key={a} style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.2)", marginTop: 5, flexShrink: 0 }} />
                      {a}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!actionTaken ? (
        <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.12)" }}>
          {showRejectInput ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="text"
                placeholder="Reason for rejection (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.8)", fontSize: 12.5, fontFamily: "inherit", outline: "none" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { onReject(rec.rank, rejectReason); setShowRejectInput(false); }} disabled={loading} style={{ flex: 1, padding: "8px", borderRadius: 10, background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }}>
                  Confirm Rejection
                </button>
                <button onClick={() => setShowRejectInput(false)} style={{ padding: "8px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onApprove(rec.rank)} disabled={loading} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px", borderRadius: 10, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.32)", color: "#6ee7b7", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1, transition: "all 0.15s" }}>
                <Check size={14} strokeWidth={2.5} /> Approve
              </button>
              <button onClick={() => onRegenerate(rec.rank)} disabled={loading} title="Regenerate message" style={{ width: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", cursor: "pointer", opacity: loading ? 0.5 : 1, transition: "all 0.15s" }}>
                <RefreshCw size={13} style={{ animation: loading ? "spin 1.2s linear infinite" : "none" }} />
              </button>
              <button onClick={() => setShowRejectInput(true)} disabled={loading} title="Reject" style={{ width: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)", cursor: "pointer", opacity: loading ? 0.5 : 1, transition: "all 0.15s" }}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <ActionBanner action={actionTaken} />
      )}
    </div>
  );
}

function ActionBanner({ action }: { action: string }) {
  const styles: Record<string, { bg: string; border: string; color: string; icon: React.ReactNode; label: string }> = {
    approved: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", color: "#6ee7b7", icon: <Check size={12} strokeWidth={2.5} />, label: "Approved" },
    rejected: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)",   color: "#fca5a5", icon: <X size={12} />,                           label: "Rejected" },
    edited:   { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.22)", color: "#93c5fd", icon: <Pencil size={11} />,                      label: "Edited & Saved" },
  };
  const s = styles[action] ?? styles.approved;
  return (
    <div style={{ padding: "11px 18px", background: s.bg, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: s.color, borderTop: `1px solid ${s.border}` }}>
      {s.icon} {s.label}
    </div>
  );
}

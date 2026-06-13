import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Signal {
  category: string;
  signal: string;
  strength: string;
  source: string;
}

const STRENGTH_STYLES: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  strong:   { bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.22)", dot: "#a78bfa",   text: "rgba(196,181,253,0.9)" },
  moderate: { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.22)", dot: "#93c5fd",   text: "rgba(147,197,253,0.9)" },
  weak:     { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", dot: "rgba(255,255,255,0.25)", text: "rgba(255,255,255,0.42)" },
};

export default function SignalBadges({ signals }: { signals: Signal[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? signals : signals.slice(0, 5);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {visible.map((s, i) => {
          const st = STRENGTH_STYLES[s.strength] ?? STRENGTH_STYLES.weak;
          return (
            <div key={i} style={{ fontSize: 11, fontWeight: 500, borderRadius: 9, padding: "7px 11px", border: `1px solid ${st.border}`, background: st.bg, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flexShrink: 0, marginTop: 3 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ color: st.text, lineHeight: 1.45 }}>{s.signal.length > 80 ? s.signal.slice(0, 77) + "…" : s.signal}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", marginTop: 2 }}>{s.source}</p>
              </div>
            </div>
          );
        })}
      </div>

      {signals.length > 5 && (
        <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.3)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
          {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> +{signals.length - 5} more signals</>}
        </button>
      )}
    </div>
  );
}

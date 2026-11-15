import React, { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { computeLayout, recommendedLayoutForCount } from "../layout/LayoutEngine";
import type { MatchPriority, MatchSource } from "@shared/types";

function createMatch(label: string, url: string, priority: MatchPriority): MatchSource {
  const [homeTeam, awayTeam] = label.split(" vs ").map((s) => s.trim());
  const now = Date.now();
  return {
    id: `match-${now}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    homeTeam: homeTeam ?? label,
    awayTeam: awayTeam ?? "",
    url,
    priority,
    streamMode: "embedded",
    providerFixtureId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function SessionConfig(): React.ReactElement {
  const matches = useAppStore((s) => s.matches);
  const addMatch = useAppStore((s) => s.addMatch);
  const removeMatch = useAppStore((s) => s.removeMatch);
  const updateMatch = useAppStore((s) => s.updateMatch);
  const monitors = useAppStore((s) => s.monitors);
  const selectedMonitorId = useAppStore((s) => s.selectedMonitorId);
  const selectMonitor = useAppStore((s) => s.selectMonitor);
  const setScreen = useAppStore((s) => s.setScreen);

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [sharedAlert, setSharedAlert] = useState<string | null>(null);

  const handleShareMatch = async (match: MatchSource) => {
    if (!window.matchview) return;
    await window.matchview.discovery.saveSharedLink({
      id: match.id,
      label: match.label,
      url: match.url,
      source: "You",
      createdAt: Date.now(),
    });
    // Broadcast globally to relays and locally on LAN
    void window.matchview.discovery.publishGlobalMatch(match.label, match.url);
    void window.matchview.discovery.startBroadcast(
      matches.map((m) => ({ label: m.label, url: m.url })),
    );
    setSharedAlert(`"${match.label}" published globally to Discover Matches!`);
    setTimeout(() => setSharedAlert(null), 3500);
  };

  const handleShareAllMatches = async () => {
    if (!window.matchview || matches.length === 0) return;
    const now = Date.now();
    for (const m of matches) {
      await window.matchview.discovery.saveSharedLink({
        id: m.id,
        label: m.label,
        url: m.url,
        source: "You",
        createdAt: now,
      });
    }
    // Publish globally and locally
    void window.matchview.discovery.publishGlobalMatches(
      matches.map((m) => ({ label: m.label, url: m.url })),
    );
    void window.matchview.discovery.startBroadcast(
      matches.map((m) => ({ label: m.label, url: m.url })),
    );
    setSharedAlert(`All ${matches.length} matches published globally to Discover!`);
    setTimeout(() => setSharedAlert(null), 3500);
  };

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId) ?? monitors[0];

  const preview = useMemo(() => {
    if (matches.length === 0 || !selectedMonitor) return null;
    try {
      const kind = recommendedLayoutForCount(Math.min(matches.length, 5));
      return computeLayout({
        kind,
        containerWidth: Math.round(selectedMonitor.workArea.width / selectedMonitor.scaleFactor),
        containerHeight: Math.round(selectedMonitor.workArea.height / selectedMonitor.scaleFactor),
        matches: matches.map((m) => ({ id: m.id, priority: m.priority })),
      });
    } catch {
      return null;
    }
  }, [matches, selectedMonitor]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "var(--mv-space-5) var(--mv-space-6)", borderBottom: "1px solid var(--mv-bg-hairline)", display: "flex", alignItems: "center", gap: "var(--mv-space-4)" }}>
        <h2 style={{ flex: 1 }}>Session configuration</h2>
        <button
          onClick={() => setScreen("discovery")}
          style={{
            background: "transparent",
            border: "1px solid var(--mv-bg-hairline)",
            color: "var(--mv-text-secondary)",
            borderRadius: "var(--mv-radius-sm)",
            padding: "var(--mv-space-2) var(--mv-space-4)",
            fontSize: 12,
          }}
        >
          📡 Discover links
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, padding: "var(--mv-space-6)", overflowY: "auto" }}>
          {sharedAlert && (
            <div
              style={{
                background: "rgba(232, 163, 61, 0.15)",
                border: "1px solid var(--mv-accent)",
                color: "var(--mv-text-primary)",
                borderRadius: "var(--mv-radius-sm)",
                padding: "var(--mv-space-2) var(--mv-space-4)",
                fontSize: 13,
                marginBottom: "var(--mv-space-4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>✓ {sharedAlert}</span>
              <button
                onClick={() => setScreen("discovery")}
                style={{ ...ghostBtn, fontSize: 12, padding: "2px 8px" }}
              >
                View in Discover Matches →
              </button>
            </div>
          )}

          <h3>1. Display</h3>
          <div style={{ display: "flex", gap: "var(--mv-space-3)", flexWrap: "wrap", marginBottom: "var(--mv-space-5)" }}>
            {monitors.length === 0 && (
              <p style={{ color: "var(--mv-text-tertiary)" }}>No monitors detected.</p>
            )}
            {monitors.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMonitor(m.id)}
                style={{
                  border: `1px solid ${selectedMonitorId === m.id ? "var(--mv-accent)" : "var(--mv-bg-hairline)"}`,
                  background: "var(--mv-bg-panel)",
                  color: "var(--mv-text-primary)",
                  borderRadius: "var(--mv-radius-md)",
                  padding: "var(--mv-space-3) var(--mv-space-4)",
                  textAlign: "left",
                }}
              >
                <div style={{ fontFamily: "var(--mv-font-display)", fontSize: 13 }}>{m.label}</div>
                <div style={{ color: "var(--mv-text-secondary)", fontSize: 12 }}>
                  {m.bounds.width}×{m.bounds.height} · {m.scaleFactor}x scale · {m.rotation}°
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--mv-space-3)" }}>
            <h3 style={{ margin: 0 }}>2. Match sources</h3>
            {matches.length > 0 && (
              <button
                onClick={() => void handleShareAllMatches()}
                style={{ ...ghostBtn, fontSize: 12, padding: "3px 8px" }}
                title="Post all current match links to Discover Matches"
              >
                📡 Share All to Discover
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--mv-space-2)", marginBottom: "var(--mv-space-3)" }}>
            <input
              placeholder="Home Team vs Away Team"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Stream URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ ...inputStyle, flex: 1.5 }}
            />
            <button
              disabled={!label || !url || matches.length >= 5}
              onClick={() => {
                addMatch(createMatch(label, url, Math.min(matches.length + 1, 5) as MatchPriority));
                setLabel("");
                setUrl("");
              }}
              style={addButtonStyle}
            >
              Add match
            </button>
          </div>
          {matches.length >= 5 && (
            <p style={{ color: "var(--mv-warning)", fontSize: 12 }}>
              Maximum of 5 simultaneous matches supported.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--mv-space-2)" }}>
            {matches.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--mv-space-3)",
                  background: "var(--mv-bg-panel)",
                  border: "1px solid var(--mv-bg-hairline)",
                  borderRadius: "var(--mv-radius-md)",
                  padding: "var(--mv-space-3)",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontFamily: "var(--mv-font-mono)",
                    background: `var(--mv-priority-${m.priority})`,
                    color: "var(--mv-bg-base)",
                  }}
                >
                  {m.priority}
                </span>
                <span style={{ flex: 1 }}>{m.label}</span>
                <select
                  value={m.priority}
                  onChange={(e) => updateMatch(m.id, { priority: Number(e.target.value) as MatchPriority })}
                  style={{ ...inputStyle, width: 90 }}
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>
                      Priority {p}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void handleShareMatch(m)}
                  style={{ ...ghostBtn, fontSize: 11, padding: "2px 8px" }}
                  title="Post this match link to Discover Matches"
                >
                  📡 Share
                </button>
                <button onClick={() => removeMatch(m.id)} style={removeButtonStyle}>
                  Remove
                </button>
              </div>
            ))}
            {matches.length === 0 && (
              <p style={{ color: "var(--mv-text-tertiary)" }}>
                No matches added yet. Add at least two sources to preview a layout.
              </p>
            )}
          </div>
        </div>

        <aside
          style={{
            width: 360,
            borderLeft: "1px solid var(--mv-bg-hairline)",
            padding: "var(--mv-space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--mv-space-4)",
          }}
        >
          <h3>Layout preview</h3>
          {preview && selectedMonitor ? (
            <>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: `${preview.containerWidth} / ${preview.containerHeight}`,
                  background: "var(--mv-bg-base)",
                  border: "1px solid var(--mv-bg-hairline)",
                }}
              >
                {preview.slots.map((slot) => (
                  <div
                    key={slot.matchId}
                    style={{
                      position: "absolute",
                      left: `${(slot.rect.x / preview.containerWidth) * 100}%`,
                      top: `${(slot.rect.y / preview.containerHeight) * 100}%`,
                      width: `${(slot.rect.width / preview.containerWidth) * 100}%`,
                      height: `${(slot.rect.height / preview.containerHeight) * 100}%`,
                      background: slot.isPrimary ? "rgba(232,163,61,0.18)" : "var(--mv-bg-panel)",
                      border: `1px solid ${slot.isPrimary ? "var(--mv-accent)" : "var(--mv-bg-hairline)"}`,
                      fontSize: 10,
                      color: "var(--mv-text-secondary)",
                      padding: 4,
                      overflow: "hidden",
                    }}
                  >
                    {matches.find((m) => m.id === slot.matchId)?.label}
                    <div style={{ color: "var(--mv-text-tertiary)" }}>
                      {Math.round(slot.rect.width)}×{Math.round(slot.rect.height)}
                    </div>
                  </div>
                ))}
              </div>
              {preview.warnings.map((w, i) => (
                <p
                  key={i}
                  style={{
                    color: w.severity === "critical" ? "var(--mv-critical)" : "var(--mv-warning)",
                    fontSize: 12,
                    margin: 0,
                  }}
                >
                  {w.message}
                </p>
              ))}
            </>
          ) : (
            <p style={{ color: "var(--mv-text-tertiary)" }}>Add matches and select a monitor to preview.</p>
          )}

          <button
            disabled={matches.length === 0 || !selectedMonitor}
            onClick={() => setScreen("live")}
            style={{ ...addButtonStyle, marginTop: "auto" }}
          >
            Start session
          </button>
        </aside>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--mv-bg-raised)",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-primary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-3)",
  flex: 1,
};

const addButtonStyle: React.CSSProperties = {
  background: "var(--mv-accent)",
  color: "var(--mv-accent-text-on)",
  border: "none",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-4)",
  fontWeight: 600,
};

const removeButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-1) var(--mv-space-3)",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "4px 10px",
  cursor: "pointer",
};

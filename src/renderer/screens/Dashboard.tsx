import React, { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

export function Dashboard(): React.ReactElement {
  const setScreen = useAppStore((s) => s.setScreen);
  const monitors = useAppStore((s) => s.monitors);
  const setMonitors = useAppStore((s) => s.setMonitors);

  useEffect(() => {
    window.matchview?.monitors.list().then(setMonitors).catch(() => void 0);
  }, [setMonitors]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "var(--mv-space-6) var(--mv-space-6) var(--mv-space-5)",
          borderBottom: "1px solid var(--mv-bg-hairline)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--mv-space-3)" }}>
          <h1 style={{ letterSpacing: "0.02em" }}>MATCHVIEW</h1>
          <span style={{ color: "var(--mv-text-tertiary)", fontSize: 12, textTransform: "uppercase" }}>
            Multi-match control
          </span>
        </div>
      </header>

      <main style={{ flex: 1, padding: "var(--mv-space-6)", display: "flex", gap: "var(--mv-space-6)" }}>
        <section style={{ flex: 2, display: "flex", flexDirection: "column", gap: "var(--mv-space-4)" }}>
          <button
            onClick={() => setScreen("session-config")}
            style={{
              background: "var(--mv-accent)",
              color: "var(--mv-accent-text-on)",
              border: "none",
              borderRadius: "var(--mv-radius-md)",
              padding: "var(--mv-space-4) var(--mv-space-5)",
              fontFamily: "var(--mv-font-display)",
              fontSize: 16,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              width: "fit-content",
            }}
          >
            Start viewing session
          </button>
          <button
            onClick={() => setScreen("discovery")}
            style={{
              background: "transparent",
              color: "var(--mv-text-secondary)",
              border: "1px solid var(--mv-bg-hairline)",
              borderRadius: "var(--mv-radius-md)",
              padding: "var(--mv-space-3) var(--mv-space-5)",
              fontFamily: "var(--mv-font-display)",
              fontSize: 14,
              letterSpacing: "0.04em",
              width: "fit-content",
            }}
          >
            📡 Discover match links
          </button>

          <div
            style={{
              background: "var(--mv-bg-panel)",
              border: "1px solid var(--mv-bg-hairline)",
              borderRadius: "var(--mv-radius-md)",
              padding: "var(--mv-space-5)",
            }}
          >
            <h3>Connected displays</h3>
            {monitors.length === 0 ? (
              <p style={{ color: "var(--mv-text-tertiary)" }}>
                No display information yet — detecting monitors...
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "var(--mv-space-3) 0 0" }}>
                {monitors.map((m) => (
                  <li
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "var(--mv-space-2) 0",
                      borderTop: "1px solid var(--mv-bg-hairline)",
                    }}
                  >
                    <span>
                      {m.label}
                      {m.isPrimary && (
                        <span style={{ color: "var(--mv-accent)", marginLeft: 8, fontSize: 11 }}>
                          PRIMARY
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--mv-text-secondary)", fontFamily: "var(--mv-font-mono)" }}>
                      {m.bounds.width}×{m.bounds.height} @ {m.scaleFactor}x
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--mv-space-4)" }}>
          <div
            style={{
              background: "var(--mv-bg-panel)",
              border: "1px solid var(--mv-bg-hairline)",
              borderRadius: "var(--mv-radius-md)",
              padding: "var(--mv-space-5)",
            }}
          >
            <h3>Saved layouts</h3>
            <p style={{ color: "var(--mv-text-tertiary)" }}>No saved layouts yet.</p>
          </div>
          <button
            onClick={() => setScreen("settings")}
            style={{
              background: "transparent",
              border: "1px solid var(--mv-bg-hairline)",
              color: "var(--mv-text-secondary)",
              borderRadius: "var(--mv-radius-md)",
              padding: "var(--mv-space-3) var(--mv-space-4)",
              textAlign: "left",
            }}
          >
            Settings
          </button>
        </aside>
      </main>
    </div>
  );
}

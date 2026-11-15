import React, { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";

export function Settings(): React.ReactElement {
  const setScreen = useAppStore((s) => s.setScreen);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [browser, setBrowser] = useState<"system" | "chrome" | "edge" | "brave">("system");

  useEffect(() => {
    window.matchview?.events.hasApiKey().then(setHasKey).catch(() => void 0);
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "var(--mv-space-5) var(--mv-space-6)", borderBottom: "1px solid var(--mv-bg-hairline)", display: "flex" }}>
        <h2 style={{ flex: 1 }}>Settings</h2>
        <button onClick={() => setScreen("dashboard")} style={ghostBtn}>
          Done
        </button>
      </header>

      <main style={{ flex: 1, padding: "var(--mv-space-6)", display: "flex", flexDirection: "column", gap: "var(--mv-space-5)", maxWidth: 560 }}>
        <section style={panelStyle}>
          <h3>Event API (football data provider)</h3>
          <p style={hintStyle}>
            MatchView uses API-FOOTBALL for live goal/card events. A key is required for automatic
            overlays to function — without one, the application will not simulate or guess events.
            Your key is encrypted on this device using Windows' credential store and is never written
            to the application database or any file you might share.
          </p>
          <div style={{ display: "flex", gap: "var(--mv-space-2)" }}>
            <input
              type="password"
              placeholder={hasKey ? "Key is set (hidden)" : "Paste API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              style={primaryBtn}
              onClick={async () => {
                if (!apiKey) return;
                await window.matchview?.events.setApiKey(apiKey);
                setApiKey("");
                setHasKey(true);
              }}
            >
              Save
            </button>
            {hasKey && (
              <button
                style={ghostBtn}
                onClick={async () => {
                  await window.matchview?.events.clearApiKey();
                  setHasKey(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <p style={{ ...hintStyle, color: hasKey ? "var(--mv-success)" : "var(--mv-text-tertiary)" }}>
            {hasKey ? "Configured." : "Not configured — automatic overlays are disabled until a key is added."}
          </p>
        </section>

        <section style={panelStyle}>
          <h3>Browser preference (external viewing mode)</h3>
          <p style={hintStyle}>
            Used when a streaming source cannot be embedded. MatchView can reliably reposition a
            dedicated top-level browser window; it cannot reposition a single tab inside a browser
            window you already have open elsewhere.
          </p>
          <select value={browser} onChange={(e) => setBrowser(e.target.value as typeof browser)} style={inputStyle}>
            <option value="system">System default</option>
            <option value="chrome">Google Chrome</option>
            <option value="edge">Microsoft Edge</option>
            <option value="brave">Brave</option>
          </select>
        </section>

        <section style={panelStyle}>
          <h3>Known limitations</h3>
          <ul style={{ color: "var(--mv-text-secondary)", fontSize: 12, paddingLeft: 18, margin: 0 }}>
            <li>Not every streaming site can be embedded; many block iframe-style embedding or require DRM.</li>
            <li>External mode positions whole browser windows, not individual tabs.</li>
            <li>Event timing depends on your data provider's reporting speed and your own stream's delay — see Event Management → calibration.</li>
            <li>MatchView does not download, store, or replay broadcaster video footage.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--mv-bg-panel)",
  border: "1px solid var(--mv-bg-hairline)",
  borderRadius: "var(--mv-radius-md)",
  padding: "var(--mv-space-5)",
};
const hintStyle: React.CSSProperties = { color: "var(--mv-text-tertiary)", fontSize: 12 };
const inputStyle: React.CSSProperties = {
  background: "var(--mv-bg-raised)",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-primary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-3)",
};
const primaryBtn: React.CSSProperties = {
  background: "var(--mv-accent)",
  color: "var(--mv-accent-text-on)",
  border: "none",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-4)",
  fontWeight: 600,
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "6px 12px",
};

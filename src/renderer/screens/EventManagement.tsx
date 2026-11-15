import React from "react";
import { useAppStore } from "../store/useAppStore";

export function EventManagement(): React.ReactElement {
  const setScreen = useAppStore((s) => s.setScreen);
  const eventSettings = useAppStore((s) => s.eventSettings);
  const updateEventSettings = useAppStore((s) => s.updateEventSettings);
  const overlayQueue = useAppStore((s) => s.overlayQueue);
  const matches = useAppStore((s) => s.matches);

  const persist = (patch: Partial<typeof eventSettings>) => {
    updateEventSettings(patch);
    void window.matchview?.events.updateSettings({ ...eventSettings, ...patch });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "var(--mv-space-5) var(--mv-space-6)", borderBottom: "1px solid var(--mv-bg-hairline)", display: "flex", alignItems: "center" }}>
        <h2 style={{ flex: 1 }}>Event management</h2>
        <button onClick={() => setScreen("live")} style={ghostBtn}>
          Back to live view
        </button>
      </header>

      <main style={{ flex: 1, padding: "var(--mv-space-6)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--mv-space-6)", overflowY: "auto" }}>
        <section style={panelStyle}>
          <h3>Automatic overlays</h3>
          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={eventSettings.automaticOverlaysEnabled}
              onChange={(e) => persist({ automaticOverlaysEnabled: e.target.checked })}
            />
            Enable automatic event overlays
          </label>

          <label style={rowStyle}>
            Event delay (stream vs. data provider latency)
            <input
              type="number"
              min={0}
              step={1000}
              value={eventSettings.eventDelayMs}
              onChange={(e) => persist({ eventDelayMs: Number(e.target.value) })}
              style={numberInput}
            />
            ms
          </label>
          <p style={hintStyle}>
            Your stream is typically several seconds to a few minutes behind the live data provider.
            This delay holds the overlay back so it doesn't reveal the goal before it happens on your
            screen. Use "Calibrate" below to measure your actual stream delay.
          </p>

          <label style={rowStyle}>
            Overlay duration
            <input
              type="number"
              min={2000}
              step={1000}
              value={eventSettings.overlayDurationMs}
              onChange={(e) => persist({ overlayDurationMs: Number(e.target.value) })}
              style={numberInput}
            />
            ms
          </label>

          <label style={rowStyle}>
            Manual stream offset calibration
            <input
              type="number"
              value={eventSettings.manualStreamOffsetMs}
              onChange={(e) => persist({ manualStreamOffsetMs: Number(e.target.value) })}
              style={numberInput}
            />
            ms
          </label>
          <p style={hintStyle}>
            If overlays still feel early or late after setting the event delay, adjust this manual
            offset. Positive values delay the overlay further; negative values show it sooner. There is
            no fully automatic way to measure your exact stream latency without reading timestamps off
            your own screen, so this is an honest manual calibration control, not an automatic sync.
          </p>

          <label style={rowStyle}>
            Polling interval
            <input
              type="number"
              min={5000}
              step={1000}
              value={eventSettings.pollIntervalMs}
              onChange={(e) => persist({ pollIntervalMs: Number(e.target.value) })}
              style={numberInput}
            />
            ms
          </label>
        </section>

        <section style={panelStyle}>
          <h3>Interruption rules</h3>
          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={eventSettings.primaryMatchIsProtected}
              onChange={(e) => persist({ primaryMatchIsProtected: e.target.checked })}
            />
            Never interrupt my primary match
          </label>
          <label style={rowStyle}>
            <input
              type="checkbox"
              checked={eventSettings.lowerPriorityCanInterrupt}
              onChange={(e) => persist({ lowerPriorityCanInterrupt: e.target.checked })}
            />
            Allow lower-priority matches to interrupt higher-priority ones
          </label>

          <h3 style={{ marginTop: "var(--mv-space-5)" }}>Trigger event types</h3>
          {(["goal", "own_goal", "penalty", "red_card"] as const).map((type) => (
            <label key={type} style={rowStyle}>
              <input
                type="checkbox"
                checked={eventSettings.triggerTypes.includes(type)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...eventSettings.triggerTypes, type]
                    : eventSettings.triggerTypes.filter((t) => t !== type);
                  persist({ triggerTypes: next });
                }}
              />
              {type.replace("_", " ")}
            </label>
          ))}
        </section>

        <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
          <h3>Pending event queue</h3>
          {overlayQueue.length === 0 ? (
            <p style={hintStyle}>No events are currently queued.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {overlayQueue.map((o) => (
                <li key={o.id} style={{ ...rowStyle, justifyContent: "space-between" }}>
                  <span>
                    {matches.find((m) => m.id === o.matchId)?.label ?? o.matchId} —{" "}
                    {o.event.type.replace("_", " ")} ({o.event.minute}')
                  </span>
                  <span style={{ color: "var(--mv-text-tertiary)" }}>{o.state}</span>
                </li>
              ))}
            </ul>
          )}
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

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--mv-space-2)",
  margin: "var(--mv-space-2) 0",
  fontSize: 13,
};

const numberInput: React.CSSProperties = {
  width: 90,
  background: "var(--mv-bg-raised)",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-primary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "4px 8px",
};

const hintStyle: React.CSSProperties = {
  color: "var(--mv-text-tertiary)",
  fontSize: 12,
  margin: "0 0 var(--mv-space-3)",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "6px 12px",
};

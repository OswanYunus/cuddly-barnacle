import React, { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { DiscoveredSession, SharedMatchEntry } from "@shared/types";

export function Discovery(): React.ReactElement {
  const setScreen = useAppStore((s) => s.setScreen);
  const matches = useAppStore((s) => s.matches);
  const addMatch = useAppStore((s) => s.addMatch);

  const [peers, setPeers] = useState<DiscoveredSession[]>([]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importedMatches, setImportedMatches] = useState<SharedMatchEntry[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Listen for LAN peers
  useEffect(() => {
    const unsub = window.matchview?.discovery.onPeers((p) => setPeers(p));
    return () => unsub?.();
  }, []);

  const startBroadcast = async () => {
    const payload = matches.map((m) => ({ label: m.label, url: m.url }));
    await window.matchview?.discovery.startBroadcast(payload);
    const code = await window.matchview?.discovery.generateCode(payload);
    setShareCode(code ?? null);
    setBroadcasting(true);
  };

  const stopBroadcast = async () => {
    await window.matchview?.discovery.stopBroadcast();
    setBroadcasting(false);
  };

  const handleDecodeCode = async () => {
    setImportError(null);
    setImportedMatches(null);
    if (!importCode.trim()) return;
    const result = await window.matchview?.discovery.decodeCode(importCode.trim());
    if (result?.error) { setImportError(result.error); return; }
    setImportedMatches(result?.matches ?? null);
  };

  const importMatchesFromList = (list: SharedMatchEntry[]) => {
    const now = Date.now();
    for (const [i, m] of list.entries()) {
      const [homeTeam, awayTeam] = m.label.split(" vs ").map((s) => s.trim());
      addMatch({
        id: `import-${now}-${i}`,
        label: m.label,
        homeTeam: homeTeam ?? m.label,
        awayTeam: awayTeam ?? "",
        url: m.url,
        priority: Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5,
        streamMode: "embedded",
        providerFixtureId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    setImportedMatches(null);
    setImportCode("");
  };

  const copyCode = async () => {
    if (!shareCode) return;
    await navigator.clipboard.writeText(shareCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "var(--mv-space-5) var(--mv-space-6)", borderBottom: "1px solid var(--mv-bg-hairline)", display: "flex", alignItems: "center", gap: "var(--mv-space-4)" }}>
        <button onClick={() => setScreen("dashboard")} style={ghostBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>Match Discovery</h2>
      </header>

      <main style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
        {/* ── Share my links ── */}
        <section style={{ flex: 1, padding: "var(--mv-space-6)", borderRight: "1px solid var(--mv-bg-hairline)", overflowY: "auto" }}>
          <h3>Share your match links</h3>
          <p style={{ color: "var(--mv-text-secondary)", fontSize: 13, marginTop: 0 }}>
            Broadcast your current session on the local network and generate a share code that anyone can paste to import your links.
          </p>

          {matches.length === 0 ? (
            <p style={{ color: "var(--mv-text-tertiary)", fontSize: 13 }}>
              No matches in your current session.{" "}
              <button onClick={() => setScreen("session-config")} style={{ ...ghostBtn, fontSize: 13 }}>
                Add some →
              </button>
            </p>
          ) : (
            <>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--mv-space-4)" }}>
                {matches.map((m) => (
                  <li key={m.id} style={{ padding: "var(--mv-space-2) 0", borderBottom: "1px solid var(--mv-bg-hairline)", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{m.label}</div>
                    <div style={{ color: "var(--mv-text-tertiary)", fontSize: 11, wordBreak: "break-all" }}>{m.url}</div>
                  </li>
                ))}
              </ul>

              {!broadcasting ? (
                <button onClick={startBroadcast} style={accentBtn}>
                  📡 Broadcast on local network + generate code
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--mv-space-3)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-2)" }}>
                    <span style={{ color: "var(--mv-live)", fontSize: 11, fontWeight: 700 }}>● LIVE</span>
                    <span style={{ color: "var(--mv-text-secondary)", fontSize: 12 }}>Broadcasting on local network</span>
                    <button onClick={stopBroadcast} style={{ ...ghostBtn, fontSize: 11, marginLeft: "auto" }}>Stop</button>
                  </div>

                  {shareCode && (
                    <div style={{ background: "var(--mv-bg-panel)", border: "1px solid var(--mv-bg-hairline)", borderRadius: "var(--mv-radius-md)", padding: "var(--mv-space-4)" }}>
                      <div style={{ fontSize: 12, color: "var(--mv-text-secondary)", marginBottom: "var(--mv-space-2)" }}>Share code — paste this anywhere (chat, Discord, WhatsApp)</div>
                      <div style={{ fontFamily: "var(--mv-font-mono)", fontSize: 11, wordBreak: "break-all", color: "var(--mv-text-primary)", background: "var(--mv-bg-base)", padding: "var(--mv-space-2)", borderRadius: "var(--mv-radius-sm)" }}>
                        {shareCode}
                      </div>
                      <button onClick={copyCode} style={{ ...accentBtn, marginTop: "var(--mv-space-3)", fontSize: 12 }}>
                        {copied ? "✓ Copied!" : "Copy code"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Discover others ── */}
        <section style={{ flex: 1, padding: "var(--mv-space-6)", overflowY: "auto" }}>
          <h3>Import links</h3>

          {/* Paste a share code */}
          <div style={{ marginBottom: "var(--mv-space-6)" }}>
            <div style={{ fontSize: 13, color: "var(--mv-text-secondary)", marginBottom: "var(--mv-space-3)" }}>
              Paste a share code from another MatchView user:
            </div>
            <div style={{ display: "flex", gap: "var(--mv-space-2)" }}>
              <input
                placeholder="Paste share code…"
                value={importCode}
                onChange={(e) => { setImportCode(e.target.value); setImportError(null); setImportedMatches(null); }}
                style={{ ...inputStyle, flex: 1, fontFamily: "var(--mv-font-mono)", fontSize: 11 }}
              />
              <button onClick={handleDecodeCode} style={accentBtn} disabled={!importCode.trim()}>Decode</button>
            </div>
            {importError && <p style={{ color: "var(--mv-critical)", fontSize: 12, margin: "var(--mv-space-2) 0 0" }}>⚠ {importError}</p>}
            {importedMatches && (
              <div style={{ marginTop: "var(--mv-space-4)", background: "var(--mv-bg-panel)", border: "1px solid var(--mv-bg-hairline)", borderRadius: "var(--mv-radius-md)", padding: "var(--mv-space-4)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: "var(--mv-space-3)" }}>Found {importedMatches.length} match{importedMatches.length !== 1 ? "es" : ""}:</div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--mv-space-3)" }}>
                  {importedMatches.map((m, i) => (
                    <li key={i} style={{ fontSize: 13, padding: "var(--mv-space-1) 0", borderBottom: "1px solid var(--mv-bg-hairline)" }}>
                      <div style={{ fontWeight: 500 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "var(--mv-text-tertiary)", wordBreak: "break-all" }}>{m.url}</div>
                    </li>
                  ))}
                </ul>
                <button onClick={() => importMatchesFromList(importedMatches)} style={accentBtn}>
                  Add {importedMatches.length} match{importedMatches.length !== 1 ? "es" : ""} to my session
                </button>
              </div>
            )}
          </div>

          {/* LAN peers */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-3)", marginBottom: "var(--mv-space-3)" }}>
              <div style={{ fontSize: 13, color: "var(--mv-text-secondary)" }}>Nearby on local network:</div>
              {peers.length === 0 && <span style={{ fontSize: 12, color: "var(--mv-text-tertiary)" }}>No peers found yet</span>}
            </div>
            {peers.map((peer) => (
              <div key={peer.id} style={{ background: "var(--mv-bg-panel)", border: "1px solid var(--mv-bg-hairline)", borderRadius: "var(--mv-radius-md)", padding: "var(--mv-space-4)", marginBottom: "var(--mv-space-3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--mv-space-2)" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>📡 {peer.hostName}</div>
                  <button onClick={() => importMatchesFromList(peer.matches)} style={{ ...accentBtn, fontSize: 11 }}>
                    Import {peer.matches.length} link{peer.matches.length !== 1 ? "s" : ""}
                  </button>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {peer.matches.map((m, i) => (
                    <li key={i} style={{ fontSize: 12, color: "var(--mv-text-secondary)", padding: "2px 0" }}>
                      {m.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)", borderRadius: "var(--mv-radius-sm)", padding: "4px 10px",
  cursor: "pointer",
};

const accentBtn: React.CSSProperties = {
  background: "var(--mv-accent)", color: "var(--mv-accent-text-on)", border: "none",
  borderRadius: "var(--mv-radius-sm)", padding: "var(--mv-space-2) var(--mv-space-4)",
  fontWeight: 600, cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "var(--mv-bg-raised)", border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-primary)", borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-3)",
};

import React, { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import type { DiscoveredSession, SharedLink, SharedMatchEntry } from "@shared/types";

export function Discovery(): React.ReactElement {
  const setScreen = useAppStore((s) => s.setScreen);
  const matches = useAppStore((s) => s.matches);
  const addMatch = useAppStore((s) => s.addMatch);

  const [savedLinks, setSavedLinks] = useState<SharedLink[]>([]);
  const [peers, setPeers] = useState<DiscoveredSession[]>([]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importedMatches, setImportedMatches] = useState<SharedMatchEntry[] | null>(null);
  const [copiedLinkUrl, setCopiedLinkUrl] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // New post form state
  const [postLabel, setPostLabel] = useState("");
  const [postUrl, setPostUrl] = useState("");

  const refreshSavedLinks = useCallback(async () => {
    if (!window.matchview) return;
    try {
      const list = await window.matchview.discovery.listSharedLinks();
      setSavedLinks(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    window.matchview?.discovery.listSharedLinks().then((list) => {
      if (active) setSavedLinks(list);
    }).catch(() => {});

    const unsub = window.matchview?.discovery.onPeers((p) => {
      if (active) setPeers(p);
    });
    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  // Handle posting a new link to Discover
  const handlePostLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!postLabel.trim() || !postUrl.trim() || !window.matchview) return;

    const newLink: SharedLink = {
      id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: postLabel.trim(),
      url: postUrl.trim(),
      source: "You",
      createdAt: Date.now(),
    };

    await window.matchview.discovery.saveSharedLink(newLink);
    await refreshSavedLinks();

    // Also broadcast to LAN
    const allShares = [...savedLinks, newLink].map((s) => ({ label: s.label, url: s.url }));
    await window.matchview.discovery.startBroadcast(allShares);

    setPostLabel("");
    setPostUrl("");
  };

  const handleDeleteSharedLink = async (id: string) => {
    if (!window.matchview) return;
    await window.matchview.discovery.deleteSharedLink(id);
    await refreshSavedLinks();
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedLinkUrl(url);
    setTimeout(() => setCopiedLinkUrl(null), 2000);
  };

  const handleWatchMatch = (label: string, url: string) => {
    const [homeTeam, awayTeam] = label.split(" vs ").map((s) => s.trim());
    const now = Date.now();
    addMatch({
      id: `match-${now}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      homeTeam: homeTeam ?? label,
      awayTeam: awayTeam ?? "",
      url,
      priority: Math.min(matches.length + 1, 5) as 1 | 2 | 3 | 4 | 5,
      streamMode: "embedded",
      providerFixtureId: null,
      createdAt: now,
      updatedAt: now,
    });
    setScreen("session-config");
  };

  const handleGenerateShareCode = async () => {
    if (!window.matchview) return;
    const items = savedLinks.length > 0
      ? savedLinks.map((s) => ({ label: s.label, url: s.url }))
      : matches.map((m) => ({ label: m.label, url: m.url }));
    if (items.length === 0) return;
    const code = await window.matchview.discovery.generateCode(items);
    setShareCode(code);
  };

  const handleDecodeCode = async () => {
    setImportError(null);
    setImportedMatches(null);
    if (!importCode.trim() || !window.matchview) return;
    const result = await window.matchview.discovery.decodeCode(importCode.trim());
    if (result.error) {
      setImportError(result.error);
      return;
    }
    setImportedMatches(result.matches);
  };

  const importMatchesFromList = async (list: SharedMatchEntry[], sourceName = "Imported") => {
    if (!window.matchview) return;
    const now = Date.now();
    for (const [i, m] of list.entries()) {
      await window.matchview.discovery.saveSharedLink({
        id: `import-${now}-${i}`,
        label: m.label,
        url: m.url,
        source: sourceName,
        createdAt: now,
      });
    }
    await refreshSavedLinks();
    setImportedMatches(null);
    setImportCode("");
  };

  // Compile all peer matches for quick display
  const peerMatches: Array<{ label: string; url: string; host: string }> = [];
  for (const p of peers) {
    for (const m of p.matches) {
      peerMatches.push({ label: m.label, url: m.url, host: p.hostName });
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--mv-bg-base)" }}>
      {/* Top Header */}
      <header
        style={{
          padding: "var(--mv-space-4) var(--mv-space-6)",
          borderBottom: "1px solid var(--mv-bg-hairline)",
          display: "flex",
          alignItems: "center",
          gap: "var(--mv-space-4)",
          background: "var(--mv-bg-raised)",
        }}
      >
        <button onClick={() => setScreen("session-config")} style={ghostBtn}>
          ← Back to Sources
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Discover Matches &amp; Shared Links</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setScreen("dashboard")} style={ghostBtn}>
          Dashboard
        </button>
      </header>

      {/* Main Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: "var(--mv-space-6)", gap: "var(--mv-space-6)" }}>

        {/* ── Prominent Guide & Disclaimer ── */}
        <section
          style={{
            background: "rgba(232, 163, 61, 0.08)",
            border: "1px solid var(--mv-accent)",
            borderRadius: "var(--mv-radius-md)",
            padding: "var(--mv-space-5)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--mv-space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-2)", color: "var(--mv-accent)", fontWeight: 700, fontSize: 14 }}>
            <span>ℹ️</span>
            <span>How to watch &amp; paste match links</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--mv-text-primary)" }}>
            <strong>MatchView does not host, stream, or retransmit any video content.</strong> The links posted below are shared by viewers from the original broadcasting websites. When you watch, your app connects directly to the original site’s server with built-in ad and popup blocking.
          </p>
          <div style={{ background: "var(--mv-bg-panel)", border: "1px solid var(--mv-bg-hairline)", borderRadius: "var(--mv-radius-sm)", padding: "var(--mv-space-3)", fontSize: 12, lineHeight: 1.6, color: "var(--mv-text-secondary)" }}>
            <strong>Step-by-step:</strong><br />
            1. Find the match you want below (e.g. <em>Manchester United vs Liverpool</em>).<br />
            2. Click <strong>&quot;📺 Watch in MatchView&quot;</strong> to automatically load the link into your Sources.<br />
            3. Alternatively, click <strong>&quot;📋 Copy Link&quot;</strong>, navigate to <strong>Sources</strong>, paste the URL into the <em>Stream URL</em> input, and click <em>Add Match</em>.<br />
            4. Click <strong>Start Session</strong> to stream all your matches simultaneously without popup ads!
          </div>
        </section>

        {/* ── Form: Post a Match Link ── */}
        <section
          style={{
            background: "var(--mv-bg-panel)",
            border: "1px solid var(--mv-bg-hairline)",
            borderRadius: "var(--mv-radius-md)",
            padding: "var(--mv-space-5)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "var(--mv-space-3)", fontSize: 15 }}>
            Post a Match Link to Discover Matches
          </h3>
          <p style={{ margin: "0 0 var(--mv-space-4)", fontSize: 13, color: "var(--mv-text-secondary)" }}>
            Post the match name and the URL you use so other viewers (or your other devices) can discover and paste it.
          </p>
          <form onSubmit={handlePostLink} style={{ display: "flex", gap: "var(--mv-space-3)", flexWrap: "wrap" }}>
            <input
              placeholder="Match Name (e.g. Manchester United vs Chelsea)"
              value={postLabel}
              onChange={(e) => setPostLabel(e.target.value)}
              style={{ ...inputStyle, minWidth: 260, flex: 1 }}
            />
            <input
              placeholder="Stream URL (e.g. https://...)"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              style={{ ...inputStyle, minWidth: 320, flex: 2 }}
            />
            <button
              type="submit"
              disabled={!postLabel.trim() || !postUrl.trim()}
              style={{ ...accentBtn, opacity: !postLabel.trim() || !postUrl.trim() ? 0.6 : 1 }}
            >
              📡 Post to Discover Matches
            </button>
          </form>
        </section>

        {/* ── Discovered Matches Catalog ── */}
        <section
          style={{
            background: "var(--mv-bg-panel)",
            border: "1px solid var(--mv-bg-hairline)",
            borderRadius: "var(--mv-radius-md)",
            padding: "var(--mv-space-5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--mv-space-4)" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>
              Available Matches ({savedLinks.length + peerMatches.length})
            </h3>
            <button onClick={handleGenerateShareCode} style={ghostBtn}>
              🔗 Export All as Share Code
            </button>
          </div>

          {savedLinks.length === 0 && peerMatches.length === 0 ? (
            <div style={{ padding: "var(--mv-space-6)", textAlign: "center", color: "var(--mv-text-tertiary)", fontSize: 13 }}>
              No matches posted yet. Post a match link above or import a share code!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--mv-space-3)" }}>
              {/* Local Saved / Posted Links */}
              {savedLinks.map((link) => (
                <div
                  key={link.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--mv-space-3) var(--mv-space-4)",
                    background: "var(--mv-bg-raised)",
                    border: "1px solid var(--mv-bg-hairline)",
                    borderRadius: "var(--mv-radius-sm)",
                    gap: "var(--mv-space-4)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-2)" }}>
                      <strong style={{ fontSize: 14 }}>{link.label}</strong>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: "var(--mv-radius-sm)",
                          background: link.source === "You" ? "var(--mv-accent)" : "var(--mv-bg-hairline)",
                          color: link.source === "You" ? "var(--mv-accent-text-on)" : "var(--mv-text-secondary)",
                          fontWeight: 600,
                        }}
                      >
                        {link.source}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--mv-font-mono)",
                        fontSize: 11,
                        color: "var(--mv-text-tertiary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: 2,
                      }}
                      title={link.url}
                    >
                      {link.url}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-2)", flexShrink: 0 }}>
                    <button
                      onClick={() => void handleCopy(link.url)}
                      style={{ ...ghostBtn, fontSize: 12 }}
                      title="Copy URL to clipboard"
                    >
                      {copiedLinkUrl === link.url ? "✓ Copied!" : "📋 Copy Link"}
                    </button>
                    <button
                      onClick={() => handleWatchMatch(link.label, link.url)}
                      style={{ ...accentBtn, fontSize: 12 }}
                      title="Add to your session and open Sources"
                    >
                      📺 Watch in MatchView
                    </button>
                    <button
                      onClick={() => void handleDeleteSharedLink(link.id)}
                      style={{ ...ghostBtn, color: "var(--mv-critical)", fontSize: 12 }}
                      title="Remove from discovered matches"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {/* LAN Peer Matches */}
              {peerMatches.map((pm, idx) => (
                <div
                  key={`peer-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--mv-space-3) var(--mv-space-4)",
                    background: "var(--mv-bg-raised)",
                    border: "1px solid var(--mv-bg-hairline)",
                    borderRadius: "var(--mv-radius-sm)",
                    gap: "var(--mv-space-4)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-2)" }}>
                      <strong style={{ fontSize: 14 }}>{pm.label}</strong>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: "var(--mv-radius-sm)",
                          background: "var(--mv-live)",
                          color: "#fff",
                          fontWeight: 600,
                        }}
                      >
                        LAN: {pm.host}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--mv-font-mono)",
                        fontSize: 11,
                        color: "var(--mv-text-tertiary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: 2,
                      }}
                      title={pm.url}
                    >
                      {pm.url}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "var(--mv-space-2)", flexShrink: 0 }}>
                    <button
                      onClick={() => void handleCopy(pm.url)}
                      style={{ ...ghostBtn, fontSize: 12 }}
                    >
                      {copiedLinkUrl === pm.url ? "✓ Copied!" : "📋 Copy Link"}
                    </button>
                    <button
                      onClick={() => handleWatchMatch(pm.label, pm.url)}
                      style={{ ...accentBtn, fontSize: 12 }}
                    >
                      📺 Watch in MatchView
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Share Code & LAN Tools ── */}
        <div style={{ display: "flex", gap: "var(--mv-space-6)", flexWrap: "wrap" }}>
          {/* Share Code Generator */}
          {shareCode && (
            <div style={{ flex: 1, minWidth: 300, background: "var(--mv-bg-panel)", border: "1px solid var(--mv-bg-hairline)", borderRadius: "var(--mv-radius-md)", padding: "var(--mv-space-4)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: "var(--mv-space-2)" }}>
                Exported Share Code
              </div>
              <div style={{ fontSize: 12, color: "var(--mv-text-secondary)", marginBottom: "var(--mv-space-2)" }}>
                Send this code to friends over WhatsApp, Discord, or chat:
              </div>
              <div style={{ fontFamily: "var(--mv-font-mono)", fontSize: 11, wordBreak: "break-all", background: "var(--mv-bg-base)", padding: "var(--mv-space-2)", borderRadius: "var(--mv-radius-sm)", maxHeight: 80, overflowY: "auto" }}>
                {shareCode}
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(shareCode);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                style={{ ...accentBtn, marginTop: "var(--mv-space-3)", fontSize: 12 }}
              >
                {codeCopied ? "✓ Copied Code!" : "Copy Share Code"}
              </button>
            </div>
          )}

          {/* Import Share Code */}
          <div style={{ flex: 1, minWidth: 300, background: "var(--mv-bg-panel)", border: "1px solid var(--mv-bg-hairline)", borderRadius: "var(--mv-radius-md)", padding: "var(--mv-space-4)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: "var(--mv-space-2)" }}>
              Import Share Code
            </div>
            <div style={{ fontSize: 12, color: "var(--mv-text-secondary)", marginBottom: "var(--mv-space-2)" }}>
              Paste a share code from another user to import their matches:
            </div>
            <div style={{ display: "flex", gap: "var(--mv-space-2)" }}>
              <input
                placeholder="Paste code here…"
                value={importCode}
                onChange={(e) => {
                  setImportCode(e.target.value);
                  setImportError(null);
                  setImportedMatches(null);
                }}
                style={{ ...inputStyle, flex: 1, fontSize: 11, fontFamily: "var(--mv-font-mono)" }}
              />
              <button onClick={() => void handleDecodeCode()} style={accentBtn} disabled={!importCode.trim()}>
                Decode
              </button>
            </div>
            {importError && (
              <p style={{ color: "var(--mv-critical)", fontSize: 12, margin: "var(--mv-space-2) 0 0" }}>
                ⚠ {importError}
              </p>
            )}
            {importedMatches && (
              <div style={{ marginTop: "var(--mv-space-3)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: "var(--mv-space-1)" }}>
                  Found {importedMatches.length} match{importedMatches.length !== 1 ? "es" : ""}:
                </div>
                <button
                  onClick={() => void importMatchesFromList(importedMatches)}
                  style={{ ...accentBtn, fontSize: 12 }}
                >
                  Save {importedMatches.length} match{importedMatches.length !== 1 ? "es" : ""} to Discover
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "4px 10px",
  cursor: "pointer",
};

const accentBtn: React.CSSProperties = {
  background: "var(--mv-accent)",
  color: "var(--mv-accent-text-on)",
  border: "none",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-4)",
  fontWeight: 600,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "var(--mv-bg-raised)",
  border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-primary)",
  borderRadius: "var(--mv-radius-sm)",
  padding: "var(--mv-space-2) var(--mv-space-3)",
};

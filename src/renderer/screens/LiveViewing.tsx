import React, { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { computeOverlayLayout } from "../layout/LayoutEngine";
import type { LayoutKind } from "@shared/types";

const LAYOUT_OPTIONS: Array<{ kind: LayoutKind; label: string; minMatches: number; maxMatches: number }> = [
  { kind: "two-horizontal", label: "2 · Side by side", minMatches: 2, maxMatches: 2 },
  { kind: "two-vertical", label: "2 · Stacked", minMatches: 2, maxMatches: 2 },
  { kind: "three-primary", label: "3 · Primary focus", minMatches: 3, maxMatches: 3 },
  { kind: "three-equal", label: "3 · Equal", minMatches: 3, maxMatches: 3 },
  { kind: "four-grid", label: "4 · Grid", minMatches: 4, maxMatches: 4 },
  { kind: "five-primary", label: "5 · Primary focus", minMatches: 5, maxMatches: 5 },
];

export function LiveViewing(): React.ReactElement {
  const matches = useAppStore((s) => s.matches);
  const computedLayout = useAppStore((s) => s.computedLayout);
  const recomputeLayout = useAppStore((s) => s.recomputeLayout);
  const setLayoutKind = useAppStore((s) => s.setLayoutKind);
  const layoutKind = useAppStore((s) => s.layoutKind);
  const controlPanelVisible = useAppStore((s) => s.controlPanelVisible);
  const toggleControlPanel = useAppStore((s) => s.toggleControlPanel);
  const activeOverlay = useAppStore((s) => s.activeOverlay);
  const setScreen = useAppStore((s) => s.setScreen);

  const containerRef = useRef<HTMLDivElement>(null);
  // Track which match IDs are currently mounted with which URL
  const mountedRef = useRef<Map<string, string>>(new Map()); // matchId → url

  // --- Layout measurement ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => recomputeLayout(el.clientWidth, el.clientHeight));
    observer.observe(el);
    recomputeLayout(el.clientWidth, el.clientHeight);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKind, matches.length]);

  // On first mount, resume any views that were hidden when we navigated to Sources
  useEffect(() => {
    void window.matchview?.streaming.showAll();

    // Sync mountedRef with what's actually mounted in the main process
    window.matchview?.streaming.listMounted().then((mounted) => {
      mountedRef.current = new Map(mounted.map(({ matchId, url }) => [matchId, url]));
    }).catch(() => { /* ignore */ });
  }, []);

  // On unmount (navigating away), hide views instead of destroying them
  // so the user keeps their session (no CAPTCHA re-solve needed)
  useEffect(() => {
    return () => {
      void window.matchview?.streaming.hideAll();
    };
  }, []);

  // --- Smart stream mounting: diff layout changes ---

  // mountNew must be declared before mountStreams (which calls it inside a useCallback)
  const mountNew = useCallback(async (
    matchId: string,
    url: string,
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!window.matchview) return;
    const probe = await window.matchview.streaming.probeEmbedCompatibility(url);
    if (probe.embeddable) {
      await window.matchview.streaming.mountEmbedded(matchId, url, rect);
      mountedRef.current.set(matchId, url);
    } else {
      // Site blocks embedding — open in external browser sized to the slot
      await window.matchview.streaming.launchExternal(matchId, "system", rect);
      // External windows aren't tracked (we can't hide/show OS windows)
    }
  }, []);

  const mountStreams = useCallback(async (layout: typeof computedLayout) => {
    if (!layout || !window.matchview) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const domRect = containerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio ?? 1;
    const stillNeeded = new Set<string>();

    for (const slot of layout.slots) {
      const match = matches.find((m) => m.id === slot.matchId);
      if (!match) continue;
      stillNeeded.add(slot.matchId);

      const rect = {
        x: Math.round((domRect.left + slot.rect.x) * dpr),
        y: Math.round((domRect.top + slot.rect.y) * dpr),
        width: Math.round(slot.rect.width * dpr),
        height: Math.round(slot.rect.height * dpr),
      };

      const alreadyMountedUrl = mountedRef.current.get(slot.matchId);

      if (alreadyMountedUrl === match.url) {
        // Same URL already loaded — just resize, no reload, no CAPTCHA loss
        await window.matchview.streaming.resize(slot.matchId, rect);
      } else if (alreadyMountedUrl !== undefined) {
        // URL changed for this slot — need to remount
        await window.matchview.streaming.unmount(slot.matchId);
        mountedRef.current.delete(slot.matchId);
        await mountNew(slot.matchId, match.url, rect);
      } else {
        // New slot
        await mountNew(slot.matchId, match.url, rect);
      }
    }

    // Remove views for slots no longer in the layout
    for (const id of [...mountedRef.current.keys()]) {
      if (!stillNeeded.has(id)) {
        await window.matchview.streaming.unmount(id);
        mountedRef.current.delete(id);
      }
    }
  }, [matches, mountNew]);

  useEffect(() => {
    void mountStreams(computedLayout);
  }, [computedLayout, mountStreams]);

  // --- Overlay events ---
  useEffect(() => {
    const unsubShow = window.matchview?.events.onOverlayShow((overlay) => {
      useAppStore.getState().setActiveOverlay(overlay);
    });
    const unsubRestore = window.matchview?.events.onOverlayRestore(() => {
      useAppStore.getState().setActiveOverlay(null);
    });
    return () => { unsubShow?.(); unsubRestore?.(); };
  }, []);

  const displayLayout =
    activeOverlay && computedLayout ? computeOverlayLayout(computedLayout, activeOverlay.matchId) : computedLayout;

  const availableLayoutOptions = LAYOUT_OPTIONS.filter(
    (o) => matches.length >= o.minMatches && matches.length <= o.maxMatches,
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#000" }}>
      <div
        style={{
          display: controlPanelVisible ? "flex" : "none",
          alignItems: "center",
          gap: "var(--mv-space-4)",
          padding: "var(--mv-space-2) var(--mv-space-4)",
          background: "var(--mv-bg-raised)",
          borderBottom: "1px solid var(--mv-bg-hairline)",
          fontSize: 12,
        }}
      >
        <strong style={{ fontFamily: "var(--mv-font-display)", letterSpacing: "0.04em" }}>MATCHVIEW</strong>
        <div style={{ display: "flex", gap: "var(--mv-space-2)" }}>
          {availableLayoutOptions.map((o) => (
            <button
              key={o.kind}
              onClick={() => setLayoutKind(o.kind)}
              style={{
                background: layoutKind === o.kind ? "var(--mv-accent)" : "transparent",
                color: layoutKind === o.kind ? "var(--mv-accent-text-on)" : "var(--mv-text-secondary)",
                border: "1px solid var(--mv-bg-hairline)",
                borderRadius: "var(--mv-radius-sm)",
                padding: "4px 10px",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setScreen("events")} style={ghostBtn}>Events</button>
        <button onClick={() => setScreen("session-config")} style={ghostBtn}>Sources</button>
        <button
          onClick={() => {
            void window.matchview?.streaming.unmountAll();
            mountedRef.current.clear();
            void window.matchview?.discovery.stopBroadcast();
            setScreen("dashboard");
          }}
          style={ghostBtn}
        >
          End session
        </button>
      </div>

      <button
        onClick={toggleControlPanel}
        title={controlPanelVisible ? "Hide control panel" : "Show control panel"}
        style={{
          position: "absolute", top: 6, right: 6, zIndex: 20,
          background: "rgba(0,0,0,0.55)", border: "1px solid var(--mv-bg-hairline)",
          color: "var(--mv-text-secondary)", borderRadius: "var(--mv-radius-sm)",
          width: 24, height: 24, fontSize: 12,
        }}
      >
        {controlPanelVisible ? "▴" : "▾"}
      </button>

      <div ref={containerRef} style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        {!displayLayout && (
          <div style={emptyStateStyle}><p>No matches configured for this session.</p></div>
        )}
        {displayLayout?.slots.map((slot) => {
          const match = matches.find((m) => m.id === slot.matchId);
          const isOverlaying = activeOverlay?.matchId === slot.matchId;
          return (
            <div
              key={slot.matchId}
              style={{
                position: "absolute",
                left: slot.rect.x, top: slot.rect.y,
                width: slot.rect.width, height: slot.rect.height,
                background: "#0a0a0c",
                border: isOverlaying ? "2px solid var(--mv-accent)" : "1px solid #1c1e22",
                transition: "left var(--mv-duration-overlay) var(--mv-ease), top var(--mv-duration-overlay) var(--mv-ease), width var(--mv-duration-overlay) var(--mv-ease), height var(--mv-duration-overlay) var(--mv-ease)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--mv-text-tertiary)", fontSize: 12,
              }}
            >
              {/* BrowserView is positioned by main process exactly over this div.
                  This placeholder shows the match label until/unless the view loads. */}
              <span style={{ opacity: 0.4 }}>{match?.label ?? slot.matchId}</span>
              {isOverlaying && (
                <div style={{
                  position: "absolute", bottom: 8, left: 8,
                  background: "var(--mv-live)", color: "#fff",
                  fontSize: 11, fontFamily: "var(--mv-font-display)",
                  letterSpacing: "0.04em", padding: "3px 8px",
                  borderRadius: "var(--mv-radius-sm)",
                }}>
                  {activeOverlay?.event.type.toUpperCase().replace("_", " ")} · {activeOverlay?.event.minute}′
                  {activeOverlay?.event.playerName ? ` · ${activeOverlay.event.playerName}` : ""}
                </div>
              )}
            </div>
          );
        })}

        {activeOverlay && (
          <button
            onClick={() => window.matchview?.events.dismissOverlay(activeOverlay.id)}
            style={{
              position: "absolute", top: 8, right: 8, zIndex: 30,
              background: "rgba(0,0,0,0.6)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "var(--mv-radius-sm)", padding: "4px 10px", fontSize: 11,
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid var(--mv-bg-hairline)",
  color: "var(--mv-text-secondary)", borderRadius: "var(--mv-radius-sm)", padding: "4px 10px",
};

const emptyStateStyle: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--mv-text-tertiary)",
};

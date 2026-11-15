import { spawn } from "node:child_process";
import type { MatchSource, Rect } from "../../shared/types";

export interface CompatibilityProbeResult {
  embeddable: boolean;
  reason: string | null;
  checkedAt: number;
}

export interface BrowserViewLike {
  webContents: {
    on(event: "did-fail-load", cb: (event: unknown, errorCode: number, errorDescription: string) => void): void;
    loadURL(url: string): Promise<void>;
    setWindowOpenHandler(handler: (details: unknown) => { action: "deny" | "allow" }): void;
  };
  setBounds(rect: Rect): void;
}

export interface MainWindowLike {
  addBrowserView(view: BrowserViewLike): void;
  removeBrowserView(view: BrowserViewLike): void;
}

export interface BrowserViewFactory {
  create(): BrowserViewLike;
}

export type SupportedBrowser = "chrome" | "edge" | "brave" | "system";

const WINDOWS_BROWSER_COMMANDS: Record<Exclude<SupportedBrowser, "system">, string> = {
  chrome: "chrome",
  edge: "msedge",
  brave: "brave",
};

/** Ad/tracker domains blocked in BrowserViews */
const AD_PATTERNS: string[] = [
  "doubleclick.net", "googlesyndication.com", "google-analytics.com",
  "googletagmanager.com", "adnxs.com", "rubiconproject.com", "pubmatic.com",
  "openx.net", "spotxchange.com", "springserve.com", "moatads.com",
  "scorecardresearch.com", "quantserve.com", "outbrain.com", "taboola.com",
  "popads.net", "popcash.net", "propellerads.com", "adcash.com",
  "clickadu.com", "trafficjunky.com", "exoclick.com", "juicyads.com",
  "hilltopads.net", "adsterra.com", "admaven.com", "bidvertiser.com",
  "revcontent.com", "mgid.com", "monetag.com", "richpush.co",
  "/ads/", "/ad/", "/adserver/", "/advertising/", "/tracker/",
  "/analytics/", "/pixel/", "/beacon/", "/telemetry/",
];

export function isAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_PATTERNS.some((p) => lower.includes(p));
}

interface ViewState {
  view: BrowserViewLike;
  url: string;
  savedBounds: Rect;
  hidden: boolean;
}

export class StreamingManager {
  private views = new Map<string, ViewState>();
  private adBlockEnabled = true;

  constructor(
    private readonly window: MainWindowLike,
    private readonly viewFactory: BrowserViewFactory,
  ) {}

  setAdBlockEnabled(enabled: boolean): void {
    this.adBlockEnabled = enabled;
  }

  async probeEmbedCompatibility(url: string): Promise<CompatibilityProbeResult> {
    const probe = this.viewFactory.create();
    // Block popups in probe view too
    probe.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    return new Promise((resolve) => {
      let settled = false;
      probe.webContents.on("did-fail-load", (_e, errorCode, errorDescription) => {
        if (settled) return;
        settled = true;
        const blocked = errorCode === -27;
        resolve({
          embeddable: false,
          reason: blocked
            ? "Site blocks embedding (X-Frame-Options / CSP). Opening in browser instead."
            : `Failed to load (${errorDescription}). Opening in browser instead.`,
          checkedAt: Date.now(),
        });
      });
      probe.webContents.loadURL(url)
        .then(() => { if (!settled) { settled = true; resolve({ embeddable: true, reason: null, checkedAt: Date.now() }); } })
        .catch((err: Error) => { if (!settled) { settled = true; resolve({ embeddable: false, reason: err.message, checkedAt: Date.now() }); } });
    });
  }

  mountEmbedded(matchId: string, url: string, rect: Rect): BrowserViewLike {
    this.unmount(matchId);
    const view = this.viewFactory.create();

    // Block all popup windows — biggest source of ads on streaming sites
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    this.window.addBrowserView(view);
    view.setBounds(rect);
    void view.webContents.loadURL(url);
    this.views.set(matchId, { view, url, savedBounds: rect, hidden: false });
    return view;
  }

  resize(matchId: string, rect: Rect): void {
    const state = this.views.get(matchId);
    if (!state) return;
    state.savedBounds = rect;
    if (!state.hidden) state.view.setBounds(rect);
  }

  /**
   * Hide all BrowserViews without destroying them.
   * Used when navigating to Sources/Settings so the user doesn't lose their
   * stream session (and doesn't have to re-solve CAPTCHAs on return).
   */
  hideAll(): void {
    for (const state of this.views.values()) {
      state.view.setBounds({ x: -32000, y: -32000, width: 1, height: 1 });
      state.hidden = true;
    }
  }

  /**
   * Restore all hidden BrowserViews to their last known bounds.
   */
  showAll(): void {
    for (const state of this.views.values()) {
      if (state.hidden) {
        state.view.setBounds(state.savedBounds);
        state.hidden = false;
      }
    }
  }

  /** Returns the currently mounted match IDs and their URLs. */
  listMounted(): Array<{ matchId: string; url: string }> {
    return [...this.views.entries()].map(([matchId, s]) => ({ matchId, url: s.url }));
  }

  unmount(matchId: string): void {
    const state = this.views.get(matchId);
    if (state) {
      this.window.removeBrowserView(state.view);
      this.views.delete(matchId);
    }
  }

  unmountAll(): void {
    for (const id of [...this.views.keys()]) this.unmount(id);
  }

  launchExternal(match: MatchSource, browser: SupportedBrowser, slotRect: Rect): void {
    const args = [
      `--new-window`,
      match.url,
      `--window-position=${Math.round(slotRect.x)},${Math.round(slotRect.y)}`,
      `--window-size=${Math.round(slotRect.width)},${Math.round(slotRect.height)}`,
    ];

    if (browser === "system") {
      spawn(
        process.platform === "win32" ? "cmd" : "xdg-open",
        process.platform === "win32" ? ["/c", "start", "", match.url] : [match.url],
        { detached: true, stdio: "ignore" },
      ).unref();
      return;
    }

    spawn(WINDOWS_BROWSER_COMMANDS[browser], args, { detached: true, stdio: "ignore" }).unref();
  }
}

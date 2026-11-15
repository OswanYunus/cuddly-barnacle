import { spawn } from "node:child_process";
import type { MatchSource, Rect } from "@shared/types";

/**
 * StreamingManager
 * ----------------
 * Implements the two viewing modes described in the spec:
 *
 * MODE A (embedded): an Electron BrowserView is created and navigated to
 * the match URL inside the main window. This works ONLY for sites that do
 * not send `X-Frame-Options: DENY/SAMEORIGIN` or a restrictive
 * `Content-Security-Policy: frame-ancestors`, and that do not gate content
 * behind DRM (Widevine/EME) requiring a full browser session with
 * first-party cookies MatchView cannot provide. We do not attempt to
 * bypass any of this - we probe for it and report the result honestly.
 *
 * MODE B (external): MatchView launches (or asks the OS to activate) a
 * top-level browser window pointed at the match URL, then uses the
 * window's native handle to position/size that window to match the
 * assigned layout slot. This is reliable for whole browser *windows*.
 * It is explicitly NOT reliable for repositioning a single *tab* inside a
 * multi-tab browser window the user already has open - Windows/Chromium
 * expose window handles, not tab handles, to external applications. The
 * UI must always make this distinction clear to the user.
 */

export interface CompatibilityProbeResult {
  embeddable: boolean;
  reason: string | null;
  checkedAt: number;
}

export interface BrowserViewLike {
  webContents: {
    on(event: "did-fail-load", cb: (event: unknown, errorCode: number, errorDescription: string) => void): void;
    loadURL(url: string): Promise<void>;
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

/** Known executable launch strategies on Windows. User-configurable default lives in AppPreferences. */
const WINDOWS_BROWSER_COMMANDS: Record<Exclude<SupportedBrowser, "system">, string> = {
  chrome: "chrome",
  edge: "msedge",
  brave: "brave",
};

export class StreamingManager {
  private views = new Map<string, BrowserViewLike>();

  constructor(
    private readonly window: MainWindowLike,
    private readonly viewFactory: BrowserViewFactory,
  ) {}

  /**
   * Performs a best-effort compatibility check by attempting to load the
   * URL in an offscreen probe view and inspecting the failure reason.
   * Electron surfaces frame-blocking as a `did-fail-load` with specific
   * error codes (e.g. ERR_BLOCKED_BY_RESPONSE for X-Frame-Options/CSP).
   * This is a real signal, not a guess - but a successful load does NOT
   * guarantee DRM playback will actually work, since EME/Widevine
   * failures often happen later, inside the page's own JS.
   */
  async probeEmbedCompatibility(url: string): Promise<CompatibilityProbeResult> {
    const probe = this.viewFactory.create();
    return new Promise((resolve) => {
      let settled = false;
      probe.webContents.on("did-fail-load", (_e, errorCode, errorDescription) => {
        if (settled) return;
        settled = true;
        const blocked = errorCode === -27 /* ERR_BLOCKED_BY_RESPONSE */;
        resolve({
          embeddable: false,
          reason: blocked
            ? "This site blocks embedding (X-Frame-Options / Content-Security-Policy). Use External Browser mode."
            : `Failed to load (${errorDescription}). Use External Browser mode.`,
          checkedAt: Date.now(),
        });
      });

      probe.webContents
        .loadURL(url)
        .then(() => {
          if (settled) return;
          settled = true;
          resolve({ embeddable: true, reason: null, checkedAt: Date.now() });
        })
        .catch((err: Error) => {
          if (settled) return;
          settled = true;
          resolve({ embeddable: false, reason: err.message, checkedAt: Date.now() });
        });
    });
  }

  mountEmbedded(matchId: string, url: string, rect: Rect): BrowserViewLike {
    this.unmount(matchId);
    const view = this.viewFactory.create();
    this.window.addBrowserView(view);
    view.setBounds(rect);
    void view.webContents.loadURL(url);
    this.views.set(matchId, view);
    return view;
  }

  resize(matchId: string, rect: Rect): void {
    const view = this.views.get(matchId);
    if (view) view.setBounds(rect);
  }

  unmount(matchId: string): void {
    const view = this.views.get(matchId);
    if (view) {
      this.window.removeBrowserView(view);
      this.views.delete(matchId);
    }
  }

  unmountAll(): void {
    for (const id of [...this.views.keys()]) this.unmount(id);
  }

  /**
   * Launches an external top-level browser window for a match that cannot
   * be embedded. Returns immediately after spawning; actual window-handle
   * based positioning is performed separately by WindowPositioner (Windows
   * native, via a tiny native helper or `electron`'s
   * `BrowserWindow.fromId`-style tracking is not possible for OS-level
   * browser PIDs, so real positioning requires either (a) the user's
   * browser supporting a `--window-position/--window-size` launch flag, or
   * (b) a native Win32 helper using `EnumWindows`/`SetWindowPos` matched by
   * window title). This method implements (a), which is the dependable
   * part Chrome/Edge/Brave all actually support; (b) is documented as a
   * known limitation of the initial release (see LIMITATIONS.md).
   */
  launchExternal(match: MatchSource, browser: SupportedBrowser, slotRect: Rect): void {
    const args = [
      `--new-window`,
      match.url,
      `--window-position=${Math.round(slotRect.x)},${Math.round(slotRect.y)}`,
      `--window-size=${Math.round(slotRect.width)},${Math.round(slotRect.height)}`,
    ];

    if (browser === "system") {
      // No positioning control at all when deferring to the OS default handler.
      spawn(process.platform === "win32" ? "cmd" : "xdg-open", process.platform === "win32" ? ["/c", "start", "", match.url] : [match.url], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return;
    }

    const command = WINDOWS_BROWSER_COMMANDS[browser];
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  }
}

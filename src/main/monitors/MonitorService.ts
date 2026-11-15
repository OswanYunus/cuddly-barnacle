import type { MonitorInfo, Rect } from "@shared/types";

/**
 * Minimal surface of Electron's `screen` module that we depend on.
 * Defining this ourselves (rather than importing Electron's types directly
 * everywhere) lets us inject a fake implementation in unit tests without
 * spinning up Electron at all.
 */
export interface ElectronDisplay {
  id: number;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
  rotation: 0 | 90 | 180 | 270;
  label?: string;
  internal?: boolean;
}

export interface ScreenLike {
  getAllDisplays(): ElectronDisplay[];
  getPrimaryDisplay(): ElectronDisplay;
  onDisplayChange(cb: () => void): () => void; // returns unsubscribe
}

export class MonitorUnavailableError extends Error {
  constructor(monitorId: number) {
    super(`Monitor ${monitorId} is no longer available`);
    this.name = "MonitorUnavailableError";
  }
}

export type MonitorChangeListener = (monitors: MonitorInfo[]) => void;

/**
 * MonitorService
 * --------------
 * Thin, testable wrapper around Electron's screen module. Responsible for:
 *  - Enumerating displays with the information the UI needs
 *  - Tracking which monitor the user selected
 *  - Detecting disconnection of the selected monitor and notifying listeners
 *    so the caller can fall back gracefully instead of positioning windows
 *    off-screen.
 */
export class MonitorService {
  private selectedMonitorId: number | null = null;
  private listeners = new Set<MonitorChangeListener>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly screenApi: ScreenLike) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.screenApi.onDisplayChange(() => {
      this.handleDisplayChange();
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  listMonitors(): MonitorInfo[] {
    const displays = this.screenApi.getAllDisplays();
    const primary = this.screenApi.getPrimaryDisplay();
    return displays
      .map((d, index) => toMonitorInfo(d, d.id === primary.id, index))
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  }

  getPrimaryMonitor(): MonitorInfo {
    const primary = this.screenApi.getPrimaryDisplay();
    return toMonitorInfo(primary, true, 0);
  }

  selectMonitor(monitorId: number): MonitorInfo {
    const monitors = this.listMonitors();
    const found = monitors.find((m) => m.id === monitorId);
    if (!found) {
      throw new MonitorUnavailableError(monitorId);
    }
    this.selectedMonitorId = monitorId;
    return found;
  }

  /** Returns the currently selected monitor, or null if none selected or it has disconnected. */
  getSelectedMonitor(): MonitorInfo | null {
    if (this.selectedMonitorId === null) return null;
    const monitors = this.listMonitors();
    return monitors.find((m) => m.id === this.selectedMonitorId) ?? null;
  }

  onChange(listener: MonitorChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleDisplayChange(): void {
    const monitors = this.listMonitors();
    if (
      this.selectedMonitorId !== null &&
      !monitors.some((m) => m.id === this.selectedMonitorId)
    ) {
      // Selected monitor disconnected. Fall back to primary rather than
      // leaving stale coordinates that would position windows off-screen.
      this.selectedMonitorId = null;
    }
    for (const listener of this.listeners) listener(monitors);
  }
}

function toMonitorInfo(d: ElectronDisplay, isPrimary: boolean, index: number): MonitorInfo {
  return {
    id: d.id,
    label: d.label?.trim() ? d.label : `Display ${index + 1}${isPrimary ? " (Primary)" : ""}`,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary,
    rotation: d.rotation,
  };
}

/** Resolution presets we explicitly design/test against, used by the config screen's preview. */
export const KNOWN_RESOLUTION_PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: "1920 × 1080 (Full HD)", width: 1920, height: 1080 },
  { label: "1680 × 1050", width: 1680, height: 1050 },
  { label: "1600 × 900", width: 1600, height: 900 },
  { label: "1366 × 768", width: 1366, height: 768 },
  { label: "1280 × 720", width: 1280, height: 720 },
  { label: "1024 × 768", width: 1024, height: 768 },
  { label: "800 × 600", width: 800, height: 600 },
];

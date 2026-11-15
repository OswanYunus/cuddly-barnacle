/**
 * MatchView shared domain types.
 * These types are the single source of truth for both the Electron main
 * process and the React renderer. Never duplicate these definitions.
 */

// ---------- Monitors ----------

export interface MonitorInfo {
  /** Electron display.id */
  id: number;
  /** Human readable label, e.g. "Display 1 (Primary)" */
  label: string;
  /** Full pixel bounds in OS coordinate space */
  bounds: Rect;
  /** Usable bounds excluding taskbars/docks */
  workArea: Rect;
  /** Device pixel scale factor, e.g. 1, 1.25, 1.5, 2 */
  scaleFactor: number;
  isPrimary: boolean;
  /** 0, 90, 180, 270 degrees */
  rotation: 0 | 90 | 180 | 270;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------- Matches ----------

export type MatchPriority = 1 | 2 | 3 | 4 | 5;

export type StreamMode = "embedded" | "external";

export interface MatchSource {
  id: string;
  label: string; // e.g. "Man City vs Man United"
  homeTeam: string;
  awayTeam: string;
  url: string;
  priority: MatchPriority;
  streamMode: StreamMode;
  /** External provider match id used to correlate live events. Optional: user may not link an API fixture. */
  providerFixtureId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------- Layout ----------

export type LayoutKind =
  | "single"
  | "two-horizontal"
  | "two-vertical"
  | "two-custom"
  | "three-primary"
  | "three-equal"
  | "four-grid"
  | "four-custom"
  | "five-primary"
  | "five-custom"
  | "custom";

export interface LayoutSlot {
  matchId: string;
  rect: Rect; // relative to viewing-area origin, in logical (post-DPI) pixels
  isPrimary: boolean;
}

export interface ComputedLayout {
  kind: LayoutKind;
  containerWidth: number;
  containerHeight: number;
  slots: LayoutSlot[];
  /** Smallest slot area, used for the "too small to be usable" warning */
  minSlotWidth: number;
  minSlotHeight: number;
  warnings: LayoutWarning[];
}

export interface LayoutWarning {
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface SavedLayout {
  id: string;
  name: string;
  kind: LayoutKind;
  slots: LayoutSlot[];
  createdAt: number;
}

// ---------- Football events ----------

export type FootballEventType = "goal" | "own_goal" | "penalty" | "red_card";

export interface FootballEvent {
  /** Globally unique id as reported by the provider, used for de-duplication */
  id: string;
  providerFixtureId: string;
  type: FootballEventType;
  minute: number;
  team: "home" | "away";
  playerName: string | null;
  /** Wall-clock time the provider says the event occurred (ms epoch), if known */
  occurredAt: number | null;
  /** Wall-clock time MatchView received this from the provider (ms epoch) */
  reportedAt: number;
}

export interface ProviderStatus {
  providerName: string;
  isConfigured: boolean;
  isReachable: boolean;
  lastPolledAt: number | null;
  lastError: string | null;
  rateLimitRemaining: number | null;
}

// ---------- Overlay / event settings ----------

export interface EventSettings {
  /** Global kill switch */
  automaticOverlaysEnabled: boolean;
  /** Milliseconds added before showing an overlay, to account for stream delay relative to the data provider */
  eventDelayMs: number;
  /** How long the overlay is shown before the previous layout is restored, in ms */
  overlayDurationMs: number;
  /** Which event types are allowed to trigger an overlay at all */
  triggerTypes: FootballEventType[];
  /** If true, nothing can interrupt the user's current primary match */
  primaryMatchIsProtected: boolean;
  /** If true, a goal in a lower-priority match can still interrupt a higher-priority one */
  lowerPriorityCanInterrupt: boolean;
  /** Manual calibration offset the user has measured between provider time and their own stream, in ms. Positive = stream is behind. */
  manualStreamOffsetMs: number;
  /** Polling interval for the provider, ms */
  pollIntervalMs: number;
}

export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  automaticOverlaysEnabled: true,
  eventDelayMs: 15000,
  overlayDurationMs: 12000,
  triggerTypes: ["goal", "own_goal", "penalty", "red_card"],
  primaryMatchIsProtected: false,
  lowerPriorityCanInterrupt: true,
  manualStreamOffsetMs: 0,
  pollIntervalMs: 20000,
};

// ---------- Overlay runtime state ----------

export interface ScheduledOverlay {
  id: string;
  event: FootballEvent;
  matchId: string;
  /** When this overlay is due to actually display, ms epoch (occurredAt/reportedAt + eventDelayMs + manualStreamOffsetMs) */
  dueAt: number;
  /** When it should auto-restore, set once it starts showing */
  expiresAt: number | null;
  state: "queued" | "showing" | "dismissed" | "expired" | "suppressed";
  suppressedReason: string | null;
}

// ---------- Persistence ----------

export interface AppPreferences {
  selectedMonitorId: number | null;
  preferredBrowser: "system" | "chrome" | "edge" | "brave";
  theme: "dark" | "light";
  eventSettings: EventSettings;
}

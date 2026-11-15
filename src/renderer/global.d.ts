import type {
  AppPreferences,
  EventSettings,
  FootballEvent,
  MatchSource,
  MonitorInfo,
  ProviderStatus,
  Rect,
  SavedLayout,
  ScheduledOverlay,
} from "@shared/types";

export interface MatchViewBridge {
  monitors: {
    list(): Promise<MonitorInfo[]>;
    select(id: number): Promise<MonitorInfo>;
    onChange(cb: (monitors: MonitorInfo[]) => void): () => void;
  };
  persistence: {
    getPreferences(): Promise<AppPreferences>;
    savePreferences(prefs: AppPreferences): Promise<void>;
    listMatches(): Promise<MatchSource[]>;
    upsertMatch(match: MatchSource): Promise<void>;
    deleteMatch(id: string): Promise<void>;
    listSavedLayouts(): Promise<SavedLayout[]>;
    saveLayout(layout: SavedLayout): Promise<void>;
  };
  streaming: {
    probeEmbedCompatibility(url: string): Promise<{ embeddable: boolean; reason: string | null }>;
    mountEmbedded(matchId: string, url: string, rect: Rect): Promise<void>;
    resize(matchId: string, rect: Rect): Promise<void>;
    unmount(matchId: string): Promise<void>;
    launchExternal(matchId: string, browser: string, rect: Rect): Promise<void>;
  };
  events: {
    getProviderStatus(): Promise<ProviderStatus>;
    setApiKey(key: string): Promise<void>;
    clearApiKey(): Promise<void>;
    hasApiKey(): Promise<boolean>;
    onEvent(cb: (event: FootballEvent) => void): () => void;
    onOverlayShow(cb: (overlay: ScheduledOverlay) => void): () => void;
    onOverlayRestore(cb: (overlay: ScheduledOverlay) => void): () => void;
    onQueueChanged(cb: (queue: ScheduledOverlay[]) => void): () => void;
    dismissOverlay(overlayId: string): Promise<void>;
    setPaused(paused: boolean): Promise<void>;
    updateSettings(settings: EventSettings): Promise<void>;
  };
}

declare global {
  interface Window {
    matchview?: MatchViewBridge;
  }
}

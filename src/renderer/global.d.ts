import type {
  AppPreferences,
  DiscoveredSession,
  EventSettings,
  FootballEvent,
  MatchSource,
  MonitorInfo,
  ProviderStatus,
  Rect,
  SavedLayout,
  ScheduledOverlay,
  SharedLink,
  SharedMatchEntry,
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
    unmountAll(): Promise<void>;
    hideAll(): Promise<void>;
    showAll(): Promise<void>;
    listMounted(): Promise<Array<{ matchId: string; url: string }>>;
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
  adBlocker: {
    setEnabled(enabled: boolean): Promise<void>;
    isEnabled(): Promise<boolean>;
  };
  discovery: {
    listSharedLinks(): Promise<SharedLink[]>;
    saveSharedLink(link: SharedLink): Promise<void>;
    deleteSharedLink(id: string): Promise<void>;
    listGlobalMatches(): Promise<SharedLink[]>;
    publishGlobalMatch(label: string, url: string, author?: string): Promise<void>;
    publishGlobalMatches(matches: SharedMatchEntry[], author?: string): Promise<void>;
    onGlobalMatches(cb: (matches: SharedLink[]) => void): () => void;
    startBroadcast(matches: SharedMatchEntry[]): Promise<void>;
    stopBroadcast(): Promise<void>;
    generateCode(matches: SharedMatchEntry[]): Promise<string>;
    decodeCode(code: string): Promise<{ matches: SharedMatchEntry[] | null; error: string | null }>;
    onPeers(cb: (peers: DiscoveredSession[]) => void): () => void;
  };
}

declare global {
  interface Window {
    matchview?: MatchViewBridge;
  }
}

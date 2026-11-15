import { contextBridge, ipcRenderer } from "electron";
import type {
  AppPreferences,
  DiscoveredSession,
  EventSettings,
  FootballEvent,
  MatchSource,
  MonitorInfo,
  Rect,
  SavedLayout,
  ScheduledOverlay,
  SharedLink,
  SharedMatchEntry,
} from "../shared/types";

contextBridge.exposeInMainWorld("matchview", {
  monitors: {
    list: (): Promise<MonitorInfo[]> => ipcRenderer.invoke("monitors:list"),
    select: (id: number): Promise<MonitorInfo> => ipcRenderer.invoke("monitors:select", id),
    onChange: (cb: (monitors: MonitorInfo[]) => void) => {
      const listener = (_e: unknown, monitors: MonitorInfo[]) => cb(monitors);
      ipcRenderer.on("monitors:changed", listener);
      return () => ipcRenderer.removeListener("monitors:changed", listener);
    },
  },
  persistence: {
    getPreferences: (): Promise<AppPreferences> => ipcRenderer.invoke("persistence:getPreferences"),
    savePreferences: (prefs: AppPreferences): Promise<void> =>
      ipcRenderer.invoke("persistence:savePreferences", prefs),
    listMatches: (): Promise<MatchSource[]> => ipcRenderer.invoke("persistence:listMatches"),
    upsertMatch: (match: MatchSource): Promise<void> => ipcRenderer.invoke("persistence:upsertMatch", match),
    deleteMatch: (id: string): Promise<void> => ipcRenderer.invoke("persistence:deleteMatch", id),
    listSavedLayouts: (): Promise<SavedLayout[]> => ipcRenderer.invoke("persistence:listSavedLayouts"),
    saveLayout: (layout: SavedLayout): Promise<void> => ipcRenderer.invoke("persistence:saveLayout", layout),
  },
  streaming: {
    probeEmbedCompatibility: (url: string) => ipcRenderer.invoke("streaming:probe", url),
    mountEmbedded: (matchId: string, url: string, rect: Rect) =>
      ipcRenderer.invoke("streaming:mount", matchId, url, rect),
    resize: (matchId: string, rect: Rect) => ipcRenderer.invoke("streaming:resize", matchId, rect),
    unmount: (matchId: string) => ipcRenderer.invoke("streaming:unmount", matchId),
    unmountAll: () => ipcRenderer.invoke("streaming:unmountAll"),
    hideAll: () => ipcRenderer.invoke("streaming:hideAll"),
    showAll: () => ipcRenderer.invoke("streaming:showAll"),
    listMounted: (): Promise<Array<{ matchId: string; url: string }>> =>
      ipcRenderer.invoke("streaming:listMounted"),
    launchExternal: (matchId: string, browser: string, rect: Rect) =>
      ipcRenderer.invoke("streaming:launchExternal", matchId, browser, rect),
  },
  events: {
    getProviderStatus: () => ipcRenderer.invoke("events:getProviderStatus"),
    setApiKey: (key: string) => ipcRenderer.invoke("events:setApiKey", key),
    clearApiKey: () => ipcRenderer.invoke("events:clearApiKey"),
    hasApiKey: () => ipcRenderer.invoke("events:hasApiKey"),
    onEvent: (cb: (event: FootballEvent) => void) => {
      const listener = (_e: unknown, event: FootballEvent) => cb(event);
      ipcRenderer.on("events:new", listener);
      return () => ipcRenderer.removeListener("events:new", listener);
    },
    onOverlayShow: (cb: (overlay: ScheduledOverlay) => void) => {
      const listener = (_e: unknown, overlay: ScheduledOverlay) => cb(overlay);
      ipcRenderer.on("overlay:show", listener);
      return () => ipcRenderer.removeListener("overlay:show", listener);
    },
    onOverlayRestore: (cb: (overlay: ScheduledOverlay) => void) => {
      const listener = (_e: unknown, overlay: ScheduledOverlay) => cb(overlay);
      ipcRenderer.on("overlay:restore", listener);
      return () => ipcRenderer.removeListener("overlay:restore", listener);
    },
    onQueueChanged: (cb: (queue: ScheduledOverlay[]) => void) => {
      const listener = (_e: unknown, queue: ScheduledOverlay[]) => cb(queue);
      ipcRenderer.on("overlay:queue-changed", listener);
      return () => ipcRenderer.removeListener("overlay:queue-changed", listener);
    },
    dismissOverlay: (overlayId: string) => ipcRenderer.invoke("events:dismissOverlay", overlayId),
    setPaused: (paused: boolean) => ipcRenderer.invoke("events:setPaused", paused),
    updateSettings: (settings: EventSettings) => ipcRenderer.invoke("events:updateSettings", settings),
  },
  adBlocker: {
    setEnabled: (enabled: boolean) => ipcRenderer.invoke("adblocker:setEnabled", enabled),
    isEnabled: (): Promise<boolean> => ipcRenderer.invoke("adblocker:isEnabled"),
  },
  discovery: {
    listSharedLinks: (): Promise<SharedLink[]> => ipcRenderer.invoke("discovery:listSharedLinks"),
    saveSharedLink: (link: SharedLink): Promise<void> => ipcRenderer.invoke("discovery:saveSharedLink", link),
    deleteSharedLink: (id: string): Promise<void> => ipcRenderer.invoke("discovery:deleteSharedLink", id),
    startBroadcast: (matches: SharedMatchEntry[]) => ipcRenderer.invoke("discovery:startBroadcast", matches),
    stopBroadcast: () => ipcRenderer.invoke("discovery:stopBroadcast"),
    generateCode: (matches: SharedMatchEntry[]): Promise<string> =>
      ipcRenderer.invoke("discovery:generateCode", matches),
    decodeCode: (code: string): Promise<{ matches: SharedMatchEntry[] | null; error: string | null }> =>
      ipcRenderer.invoke("discovery:decodeCode", code),
    onPeers: (cb: (peers: DiscoveredSession[]) => void) => {
      const listener = (_e: unknown, peers: DiscoveredSession[]) => cb(peers);
      ipcRenderer.on("discovery:peers", listener);
      return () => ipcRenderer.removeListener("discovery:peers", listener);
    },
  },
});

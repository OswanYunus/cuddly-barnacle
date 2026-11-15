import { contextBridge, ipcRenderer } from "electron";
import type {
  AppPreferences,
  EventSettings,
  FootballEvent,
  MatchSource,
  MonitorInfo,
  Rect,
  SavedLayout,
  ScheduledOverlay,
} from "../shared/types";

/**
 * Preload bridge. Runs in an isolated context with access to Node/Electron
 * APIs, but only exposes the specific functions below to the renderer
 * (contextIsolation: true, nodeIntegration: false in main.ts) - the
 * renderer can never reach ipcRenderer, fs, or child_process directly.
 */
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
});

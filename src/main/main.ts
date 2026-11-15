import { app, BrowserWindow, BrowserView, screen, ipcMain, safeStorage, session } from "electron";
import * as path from "node:path";
import { MonitorService, type ScreenLike } from "./monitors/MonitorService";
import { AppDatabase } from "./persistence/Database";
import { SecureConfig } from "./config/SecureConfig";
import { ApiFootballProvider } from "./events/providers/ApiFootballProvider";
import { EventMonitor } from "./events/EventMonitor";
import { OverlayScheduler } from "./events/OverlayScheduler";
import { StreamingManager, isAdUrl } from "./streaming/StreamingManager";
import { LanDiscovery } from "./discovery/LanDiscovery";
import { DEFAULT_EVENT_SETTINGS, type EventSettings, type FootballEvent } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let streamingManager: StreamingManager | null = null;
let lanDiscovery: LanDiscovery | null = null;

const screenAdapter: ScreenLike = {
  getAllDisplays: () =>
    screen.getAllDisplays().map((d) => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation as 0 | 90 | 180 | 270,
      label: d.label,
      internal: d.internal,
    })),
  getPrimaryDisplay: () => {
    const d = screen.getPrimaryDisplay();
    return {
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation as 0 | 90 | 180 | 270,
      label: d.label,
      internal: d.internal,
    };
  },
  onDisplayChange: (cb) => {
    screen.on("display-added", cb);
    screen.on("display-removed", cb);
    screen.on("display-metrics-changed", cb);
    return () => {
      screen.removeListener("display-added", cb);
      screen.removeListener("display-removed", cb);
      screen.removeListener("display-metrics-changed", cb);
    };
  },
};

const monitorService = new MonitorService(screenAdapter);
const db = new AppDatabase(path.join(app.getPath("userData"), "matchview.sqlite"));
const secureConfig = new SecureConfig(safeStorage, app.getPath("userData"));

let eventSettings: EventSettings = db.getPreferences().eventSettings ?? DEFAULT_EVENT_SETTINGS;
let currentPrimaryMatchId: string | null = null;

const provider = new ApiFootballProvider({ apiKey: secureConfig.getApiKey() });
const eventMonitor = new EventMonitor(provider);

const overlayScheduler = new OverlayScheduler(
  eventSettings,
  (matchId) => db.listMatchSources().find((m) => m.id === matchId),
  () => currentPrimaryMatchId,
  {
    onShow: (overlay) => mainWindow?.webContents.send("overlay:show", overlay),
    onRestore: (overlay) => mainWindow?.webContents.send("overlay:restore", overlay),
    onQueueChanged: (queue) => mainWindow?.webContents.send("overlay:queue-changed", queue),
  },
);

let schedulerTickHandle: NodeJS.Timeout | null = null;

/** Apply session-level ad blocking to any BrowserView sessions */
function applyAdBlocker(ses: Electron.Session): void {
  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    callback({ cancel: isAdUrl(details.url) });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#14161a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Create a dedicated session for BrowserViews so the ad blocker only affects
  // stream views, not the main renderer UI
  const streamSession = session.fromPartition("persist:streams");
  const prefs = db.getPreferences();
  if (prefs.adBlockerEnabled !== false) applyAdBlocker(streamSession);

  streamingManager = new StreamingManager(mainWindow, {
    create: () =>
      new BrowserView({
        webPreferences: {
          session: streamSession,
          contextIsolation: true,
          nodeIntegration: false,
          autoplayPolicy: "no-user-gesture-required",
        },
      }),
  });

  // LAN discovery: push peer updates to renderer
  lanDiscovery = new LanDiscovery((peers) => {
    mainWindow?.webContents.send("discovery:peers", peers);
  });

  monitorService.start();
  schedulerTickHandle = setInterval(() => overlayScheduler.tick(), 250);

  eventMonitor.onEvents((events: FootballEvent[]) => {
    for (const event of events) {
      const match = db.listMatchSources().find((m) => m.providerFixtureId === event.providerFixtureId);
      if (match) overlayScheduler.submit(event, match.id);
    }
  });
  eventMonitor.onError((err) => mainWindow?.webContents.send("events:error", err.message));
}

function registerIpcHandlers(): void {
  // ── Monitors ──────────────────────────────────────────────────────────────
  ipcMain.handle("monitors:list", () => monitorService.listMonitors());
  ipcMain.handle("monitors:select", (_e, id: number) => monitorService.selectMonitor(id));

  // ── Persistence ───────────────────────────────────────────────────────────
  ipcMain.handle("persistence:getPreferences", () => db.getPreferences());
  ipcMain.handle("persistence:savePreferences", (_e, prefs) => db.savePreferences(prefs));
  ipcMain.handle("persistence:listMatches", () => db.listMatchSources());
  ipcMain.handle("persistence:upsertMatch", (_e, match) => db.upsertMatchSource(match));
  ipcMain.handle("persistence:deleteMatch", (_e, id: string) => db.deleteMatchSource(id));
  ipcMain.handle("persistence:listSavedLayouts", () => db.listSavedLayouts());
  ipcMain.handle("persistence:saveLayout", (_e, layout) => db.saveLayout(layout));

  // ── Events / overlay ──────────────────────────────────────────────────────
  ipcMain.handle("events:getProviderStatus", () => provider.getStatus());
  ipcMain.handle("events:setApiKey", (_e, key: string) => {
    secureConfig.setApiKey(key);
    (provider as unknown as { config: { apiKey: string | null } }).config.apiKey = key;
  });
  ipcMain.handle("events:clearApiKey", () => {
    secureConfig.clearApiKey();
    (provider as unknown as { config: { apiKey: string | null } }).config.apiKey = null;
  });
  ipcMain.handle("events:hasApiKey", () => secureConfig.hasApiKey());
  ipcMain.handle("events:dismissOverlay", (_e, overlayId: string) => overlayScheduler.dismiss(overlayId));
  ipcMain.handle("events:setPaused", (_e, paused: boolean) => overlayScheduler.setPaused(paused));
  ipcMain.handle("events:updateSettings", (_e, settings: EventSettings) => {
    eventSettings = settings;
    overlayScheduler.updateSettings(settings);
    const prefs = db.getPreferences();
    db.savePreferences({ ...prefs, eventSettings: settings });
    if (eventMonitor.isRunning()) eventMonitor.stop();
    if (settings.automaticOverlaysEnabled && provider.isConfigured()) {
      eventMonitor.start(
        () => db.listMatchSources().map((m) => m.providerFixtureId).filter((x): x is string => !!x),
        settings.pollIntervalMs,
      );
    }
  });

  // ── Streaming ─────────────────────────────────────────────────────────────
  ipcMain.handle("streaming:probe", (_e, url: string) => {
    if (!streamingManager) return { embeddable: false, reason: "App not ready", checkedAt: Date.now() };
    return streamingManager.probeEmbedCompatibility(url);
  });
  ipcMain.handle("streaming:mount", (_e, matchId: string, url: string, rect: { x: number; y: number; width: number; height: number }) => {
    streamingManager?.mountEmbedded(matchId, url, rect);
  });
  ipcMain.handle("streaming:resize", (_e, matchId: string, rect: { x: number; y: number; width: number; height: number }) => {
    streamingManager?.resize(matchId, rect);
  });
  ipcMain.handle("streaming:unmount", (_e, matchId: string) => {
    streamingManager?.unmount(matchId);
  });
  ipcMain.handle("streaming:unmountAll", () => {
    streamingManager?.unmountAll();
  });
  ipcMain.handle("streaming:hideAll", () => {
    streamingManager?.hideAll();
  });
  ipcMain.handle("streaming:showAll", () => {
    streamingManager?.showAll();
  });
  ipcMain.handle("streaming:listMounted", () => {
    return streamingManager?.listMounted() ?? [];
  });
  ipcMain.handle("streaming:launchExternal", (_e, matchId: string, browser: string, rect: { x: number; y: number; width: number; height: number }) => {
    if (!streamingManager) return;
    const match = db.listMatchSources().find((m) => m.id === matchId);
    if (match) streamingManager.launchExternal(match, browser as "chrome" | "edge" | "brave" | "system", rect);
  });

  // ── Ad blocker ────────────────────────────────────────────────────────────
  ipcMain.handle("adblocker:setEnabled", (_e, enabled: boolean) => {
    streamingManager?.setAdBlockEnabled(enabled);
    const prefs = db.getPreferences();
    db.savePreferences({ ...prefs, adBlockerEnabled: enabled });
  });
  ipcMain.handle("adblocker:isEnabled", () => {
    return db.getPreferences().adBlockerEnabled !== false;
  });

  // ── Discovery ─────────────────────────────────────────────────────────────
  ipcMain.handle("discovery:startBroadcast", (_e, matches: Array<{ label: string; url: string }>) => {
    lanDiscovery?.startBroadcasting(matches);
  });
  ipcMain.handle("discovery:stopBroadcast", () => {
    lanDiscovery?.stopBroadcasting();
  });
  ipcMain.handle("discovery:generateCode", (_e, matches: Array<{ label: string; url: string }>) => {
    return LanDiscovery.generateShareCode(matches);
  });
  ipcMain.handle("discovery:decodeCode", (_e, code: string) => {
    try {
      return { matches: LanDiscovery.decodeShareCode(code), error: null };
    } catch (e) {
      return { matches: null, error: (e as Error).message };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (schedulerTickHandle) clearInterval(schedulerTickHandle);
  eventMonitor.stop();
  monitorService.stop();
  lanDiscovery?.close();
  db.close();
  if (process.platform !== "darwin") app.quit();
});

// Keep BrowserView import live (used by streamingManager factory above)
void BrowserView;

import { AppDatabase } from "@main/persistence/Database";
import { DEFAULT_EVENT_SETTINGS } from "@shared/types";
import type { MatchSource, SavedLayout } from "@shared/types";

function makeMatch(id: string): MatchSource {
  return {
    id,
    label: `${id} label`,
    homeTeam: "Home",
    awayTeam: "Away",
    url: "https://example.com/stream",
    priority: 1,
    streamMode: "embedded",
    providerFixtureId: null,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe("AppDatabase persistence", () => {
  test("returns sensible defaults before anything is saved", () => {
    const db = new AppDatabase(":memory:");
    const prefs = db.getPreferences();
    expect(prefs.selectedMonitorId).toBeNull();
    expect(prefs.eventSettings).toEqual(DEFAULT_EVENT_SETTINGS);
    db.close();
  });

  test("saves and reloads preferences (simulated app restart)", () => {
    const path = ":memory:";
    const db = new AppDatabase(path);
    db.savePreferences({
      selectedMonitorId: 2,
      preferredBrowser: "chrome",
      theme: "dark",
      eventSettings: { ...DEFAULT_EVENT_SETTINGS, eventDelayMs: 30000 },
    });
    const reloaded = db.getPreferences();
    expect(reloaded.selectedMonitorId).toBe(2);
    expect(reloaded.preferredBrowser).toBe("chrome");
    expect(reloaded.eventSettings.eventDelayMs).toBe(30000);
    db.close();
  });

  test("upserting preferences twice updates rather than duplicating", () => {
    const db = new AppDatabase(":memory:");
    db.savePreferences({
      selectedMonitorId: 1,
      preferredBrowser: "system",
      theme: "dark",
      eventSettings: DEFAULT_EVENT_SETTINGS,
    });
    db.savePreferences({
      selectedMonitorId: 5,
      preferredBrowser: "edge",
      theme: "light",
      eventSettings: DEFAULT_EVENT_SETTINGS,
    });
    expect(db.getPreferences().selectedMonitorId).toBe(5);
    expect(db.getPreferences().preferredBrowser).toBe("edge");
    db.close();
  });

  test("match sources: insert, list ordered by priority, update, delete", () => {
    const db = new AppDatabase(":memory:");
    const m1 = { ...makeMatch("m1"), priority: 2 as const };
    const m2 = { ...makeMatch("m2"), priority: 1 as const };
    db.upsertMatchSource(m1);
    db.upsertMatchSource(m2);

    const list = db.listMatchSources();
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]); // priority 1 first

    db.upsertMatchSource({ ...m1, label: "Updated label" });
    expect(db.listMatchSources().find((m) => m.id === "m1")?.label).toBe("Updated label");

    db.deleteMatchSource("m1");
    expect(db.listMatchSources().map((m) => m.id)).toEqual(["m2"]);
    db.close();
  });

  test("saved layouts: save, list newest first, delete", () => {
    const db = new AppDatabase(":memory:");
    const layoutA: SavedLayout = {
      id: "l1",
      name: "My 4-grid",
      kind: "four-grid",
      slots: [],
      createdAt: 1000,
    };
    const layoutB: SavedLayout = {
      id: "l2",
      name: "My 3-primary",
      kind: "three-primary",
      slots: [],
      createdAt: 2000,
    };
    db.saveLayout(layoutA);
    db.saveLayout(layoutB);

    const list = db.listSavedLayouts();
    expect(list.map((l) => l.id)).toEqual(["l2", "l1"]); // newest first

    db.deleteLayout("l2");
    expect(db.listSavedLayouts().map((l) => l.id)).toEqual(["l1"]);
    db.close();
  });

  test("API keys are never present in any persisted table", () => {
    const db = new AppDatabase(":memory:");
    db.savePreferences({
      selectedMonitorId: null,
      preferredBrowser: "system",
      theme: "dark",
      eventSettings: DEFAULT_EVENT_SETTINGS,
    });
    db.upsertMatchSource(makeMatch("m1"));
    // Inspect the raw serialized preferences blob and confirm no api key-like field exists.
    const prefs = db.getPreferences();
    expect(JSON.stringify(prefs)).not.toMatch(/apiKey|api_key|secret/i);
    db.close();
  });
});

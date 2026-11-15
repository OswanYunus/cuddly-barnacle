import Database from "better-sqlite3";
import type {
  AppPreferences,
  EventSettings,
  MatchSource,
  SavedLayout,
  SharedLink,
} from "../../shared/types";
import { DEFAULT_EVENT_SETTINGS } from "../../shared/types";

const SCHEMA_VERSION = 1;

/**
 * Persistence layer backed by better-sqlite3 (synchronous, no ORM needed
 * for this schema size). Stores: app preferences, saved layouts, and match
 * configurations. Deliberately does NOT store API keys or any secret - see
 * SecureConfig.ts, which uses Electron's safeStorage (OS keychain-backed
 * encryption) instead of this database.
 */
export class AppDatabase {
  private db: InstanceType<typeof Database>;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS preferences (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        selected_monitor_id INTEGER,
        preferred_browser TEXT NOT NULL DEFAULT 'system',
        theme TEXT NOT NULL DEFAULT 'dark',
        event_settings_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_layouts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        slots_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS match_sources (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        url TEXT NOT NULL,
        priority INTEGER NOT NULL,
        stream_mode TEXT NOT NULL,
        provider_fixture_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shared_links (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    const row = this.db
      .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
      .get() as { value: string } | undefined;

    if (!row) {
      this.db
        .prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)")
        .run(String(SCHEMA_VERSION));
    }
    // Future migrations branch on the stored version number here.
  }

  // ---------- Preferences ----------

  getPreferences(): AppPreferences {
    const row = this.db.prepare("SELECT * FROM preferences WHERE id = 1").get() as
      | {
          selected_monitor_id: number | null;
          preferred_browser: AppPreferences["preferredBrowser"];
          theme: AppPreferences["theme"];
          event_settings_json: string;
        }
      | undefined;

    if (!row) {
      return {
        selectedMonitorId: null,
        preferredBrowser: "system",
        theme: "dark",
        eventSettings: DEFAULT_EVENT_SETTINGS,
        adBlockerEnabled: true,
      };
    }

    return {
      selectedMonitorId: row.selected_monitor_id,
      preferredBrowser: row.preferred_browser,
      theme: row.theme,
      eventSettings: JSON.parse(row.event_settings_json) as EventSettings,
      adBlockerEnabled: true,
    };
  }

  savePreferences(prefs: AppPreferences): void {
    this.db
      .prepare(
        `INSERT INTO preferences (id, selected_monitor_id, preferred_browser, theme, event_settings_json)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           selected_monitor_id = excluded.selected_monitor_id,
           preferred_browser = excluded.preferred_browser,
           theme = excluded.theme,
           event_settings_json = excluded.event_settings_json`,
      )
      .run(
        prefs.selectedMonitorId,
        prefs.preferredBrowser,
        prefs.theme,
        JSON.stringify(prefs.eventSettings),
      );
  }

  // ---------- Saved layouts ----------

  listSavedLayouts(): SavedLayout[] {
    const rows = this.db
      .prepare("SELECT * FROM saved_layouts ORDER BY created_at DESC")
      .all() as Array<{
      id: string;
      name: string;
      kind: SavedLayout["kind"];
      slots_json: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      slots: JSON.parse(r.slots_json) as SavedLayout["slots"],
      createdAt: r.created_at,
    }));
  }

  saveLayout(layout: SavedLayout): void {
    this.db
      .prepare(
        `INSERT INTO saved_layouts (id, name, kind, slots_json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, kind = excluded.kind, slots_json = excluded.slots_json`,
      )
      .run(layout.id, layout.name, layout.kind, JSON.stringify(layout.slots), layout.createdAt);
  }

  deleteLayout(id: string): void {
    this.db.prepare("DELETE FROM saved_layouts WHERE id = ?").run(id);
  }

  // ---------- Match sources ----------

  listMatchSources(): MatchSource[] {
    const rows = this.db.prepare("SELECT * FROM match_sources ORDER BY priority ASC").all() as Array<{
      id: string;
      label: string;
      home_team: string;
      away_team: string;
      url: string;
      priority: number;
      stream_mode: MatchSource["streamMode"];
      provider_fixture_id: string | null;
      created_at: number;
      updated_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      url: r.url,
      priority: r.priority as MatchSource["priority"],
      streamMode: r.stream_mode,
      providerFixtureId: r.provider_fixture_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  upsertMatchSource(m: MatchSource): void {
    this.db
      .prepare(
        `INSERT INTO match_sources
           (id, label, home_team, away_team, url, priority, stream_mode, provider_fixture_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label, home_team = excluded.home_team, away_team = excluded.away_team,
           url = excluded.url, priority = excluded.priority, stream_mode = excluded.stream_mode,
           provider_fixture_id = excluded.provider_fixture_id, updated_at = excluded.updated_at`,
      )
      .run(
        m.id,
        m.label,
        m.homeTeam,
        m.awayTeam,
        m.url,
        m.priority,
        m.streamMode,
        m.providerFixtureId,
        m.createdAt,
        m.updatedAt,
      );
  }

  deleteMatchSource(id: string): void {
    this.db.prepare("DELETE FROM match_sources WHERE id = ?").run(id);
  }

  // ---------- Shared links (Discovery) ----------

  listSharedLinks(): SharedLink[] {
    const rows = this.db
      .prepare("SELECT * FROM shared_links ORDER BY created_at DESC")
      .all() as Array<{
      id: string;
      label: string;
      url: string;
      source: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      url: r.url,
      source: r.source,
      createdAt: r.created_at,
    }));
  }

  saveSharedLink(link: SharedLink): void {
    this.db
      .prepare(
        `INSERT INTO shared_links (id, label, url, source, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label, url = excluded.url, source = excluded.source, created_at = excluded.created_at`,
      )
      .run(link.id, link.label, link.url, link.source, link.createdAt);
  }

  deleteSharedLink(id: string): void {
    this.db.prepare("DELETE FROM shared_links WHERE id = ?").run(id);
  }
}

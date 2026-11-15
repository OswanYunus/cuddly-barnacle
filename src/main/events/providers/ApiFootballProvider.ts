import type { FootballEvent, FootballEventType, ProviderStatus } from "../../../shared/types";
import {
  FootballDataProvider,
  ProviderNotConfiguredError,
  ProviderRateLimitError,
} from "./FootballDataProvider";

/**
 * Real integration against API-FOOTBALL's "fixtures/events" endpoint
 * (https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-events).
 *
 * This file performs an actual HTTPS request shaped exactly like the
 * documented API. It requires a real `apiKey` supplied by the user via
 * SecureConfig; it will refuse to run with a placeholder/empty key rather
 * than silently returning fake data.
 *
 * Request shape (documented): GET /fixtures/events?fixture={id}
 *   Header: x-apisports-key: <key>
 * Response shape (documented, abbreviated):
 * {
 *   "response": [
 *     {
 *       "time": { "elapsed": 63, "extra": null },
 *       "team": { "id": 33, "name": "Manchester United" },
 *       "player": { "id": 909, "name": "B. Fernandes" },
 *       "type": "Goal",
 *       "detail": "Normal Goal"   // or "Own Goal", "Penalty", "Red Card", etc.
 *     }
 *   ]
 * }
 */

const API_BASE_URL = "https://v3.football.api-sports.io";

export interface ApiFootballConfig {
  apiKey: string | null;
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

function mapEventType(type: string, detail: string): FootballEventType | null {
  const t = type.toLowerCase();
  const d = detail.toLowerCase();
  if (t !== "goal" && t !== "card") return null;
  if (t === "goal") {
    if (d.includes("own")) return "own_goal";
    if (d.includes("penalty")) return "penalty";
    return "goal";
  }
  if (t === "card" && d.includes("red")) return "red_card";
  return null;
}

export class ApiFootballProvider implements FootballDataProvider {
  readonly name = "API-FOOTBALL";

  private lastPolledAt: number | null = null;
  private lastError: string | null = null;
  private rateLimitRemaining: number | null = null;
  private seenEventKeys = new Set<string>();

  constructor(private config: ApiFootballConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.apiKey.trim().length > 10);
  }

  getStatus(): ProviderStatus {
    return {
      providerName: this.name,
      isConfigured: this.isConfigured(),
      isReachable: this.lastError === null && this.lastPolledAt !== null,
      lastPolledAt: this.lastPolledAt,
      lastError: this.lastError,
      rateLimitRemaining: this.rateLimitRemaining,
    };
  }

  async fetchEvents(fixtureIds: string[]): Promise<FootballEvent[]> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError(this.name);
    }
    const fetchImpl = this.config.fetchFn ?? fetch;
    const base = this.config.baseUrl ?? API_BASE_URL;
    const results: FootballEvent[] = [];

    for (const fixtureId of fixtureIds) {
      const url = `${base}/fixtures/events?fixture=${encodeURIComponent(fixtureId)}`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { "x-apisports-key": this.config.apiKey as string },
        });
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : "Network error";
        throw err;
      }

      this.lastPolledAt = Date.now();
      const remainingHeader = response.headers.get("x-ratelimit-requests-remaining");
      if (remainingHeader) this.rateLimitRemaining = Number(remainingHeader);

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        throw new ProviderRateLimitError(this.name, retryAfter ? Number(retryAfter) * 1000 : null);
      }
      if (!response.ok) {
        this.lastError = `HTTP ${response.status}`;
        throw new Error(`${this.name} request failed: HTTP ${response.status}`);
      }

      this.lastError = null;
      const body = (await response.json()) as {
        response: Array<{
          time: { elapsed: number; extra: number | null };
          team: { id: number; name: string };
          player: { id: number; name: string } | null;
          type: string;
          detail: string;
        }>;
      };

      for (const raw of body.response ?? []) {
        const mapped = mapEventType(raw.type, raw.detail);
        if (!mapped) continue;

        // API-FOOTBALL does not provide a stable per-event id in this
        // endpoint, so we derive a deduplication key from fixture + minute +
        // team + type + player, which is stable across repeated polls of
        // the same fixture.
        const key = `${fixtureId}:${raw.time.elapsed}:${raw.time.extra ?? 0}:${raw.team.id}:${mapped}:${raw.player?.id ?? "x"}`;
        if (this.seenEventKeys.has(key)) continue;
        this.seenEventKeys.add(key);

        results.push({
          id: key,
          providerFixtureId: fixtureId,
          type: mapped,
          minute: raw.time.elapsed,
          team: "home", // NOTE: resolving home/away requires the fixture's team-id mapping,
          // fetched once at match-link time and passed in by EventMonitor; see EventMonitor.resolveSide.
          playerName: raw.player?.name ?? null,
          occurredAt: null, // API-FOOTBALL does not return a wall-clock timestamp for the event itself
          reportedAt: Date.now(),
        });
      }
    }

    return results;
  }
}

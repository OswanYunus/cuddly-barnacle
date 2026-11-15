import type { FootballEvent, ProviderStatus } from "../../../shared/types";

/**
 * FootballDataProvider
 * ---------------------
 * Abstraction over a live football data provider. MatchView does not
 * invent or simulate live events in production code — every implementation
 * of this interface used outside of tests/ must call a real external API.
 *
 * Research notes (as of this writing) on real providers, for whoever wires
 * up credentials:
 *
 *  - API-FOOTBALL (api-football.com / RapidAPI): offers a "live fixtures"
 *    and "events" endpoint returning goals, cards, substitutions with
 *    minute-level timestamps. Free tier is heavily rate-limited (100
 *    requests/day) and NOT suitable for live polling of several matches;
 *    paid tiers scale request volume. Events are reported after a short
 *    provider-side delay (typically seconds to low tens of seconds) rather
 *    than truly instantaneously - this is why the delay/calibration system
 *    in OverlayScheduler exists.
 *  - Sportmonks Football API: similar event-level coverage, paid plans
 *    required for real-time (sub-60s) update frequency; free/trial plans
 *    poll on longer intervals.
 *  - Opta / Stats Perform: industry-grade, used by broadcasters, but
 *    enterprise contracts only - not accessible for an indie desktop app
 *    without a commercial agreement.
 *
 * None of these can be queried from the renderer directly with a
 * hardcoded key (CORS + secret exposure), so all provider calls happen in
 * the Electron MAIN process, and the key is read via SecureConfig, never
 * bundled into the built renderer JS.
 */
export interface FootballDataProvider {
  readonly name: string;

  /** Whether credentials are present/valid enough to attempt calls. */
  isConfigured(): boolean;

  /**
   * Fetch events for the given fixture ids since the last poll.
   * Implementations MUST only return events actually returned by the
   * upstream API. Throwing on network/HTTP failure is expected and is
   * handled by EventMonitor (backoff, status surfacing) - do not swallow
   * errors here.
   */
  fetchEvents(fixtureIds: string[]): Promise<FootballEvent[]>;

  getStatus(): ProviderStatus;
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(
      `${providerName} is not configured. Add an API key in Settings → Event API before enabling live event monitoring.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderRateLimitError extends Error {
  constructor(providerName: string, retryAfterMs: number | null) {
    super(
      `${providerName} rate limit reached${
        retryAfterMs ? `, retry after ${Math.ceil(retryAfterMs / 1000)}s` : ""
      }.`,
    );
    this.name = "ProviderRateLimitError";
  }
}

import type { FootballEvent } from "../../shared/types";
import type { FootballDataProvider } from "./providers/FootballDataProvider";

export type EventMonitorListener = (events: FootballEvent[]) => void;
export type ErrorListener = (error: Error) => void;

export interface EventMonitorClock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemClock: EventMonitorClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/**
 * EventMonitor
 * ------------
 * Owns the polling loop against a FootballDataProvider. Responsible for:
 *  - Preventing duplicate/overlapping polling processes (a single
 *    `start()` is idempotent; a poll in flight blocks the next tick).
 *  - De-duplicating events the provider itself might return more than
 *    once across polls (belt-and-braces on top of provider-level dedup).
 *  - Surfacing provider errors (rate limit, network, not configured)
 *    without crashing the poll loop - a single failed poll is logged and
 *    retried on the next interval, it does not stop monitoring.
 */
export class EventMonitor {
  private handle: unknown = null;
  private pollInFlight = false;
  private seenEventIds = new Set<string>();
  private listeners = new Set<EventMonitorListener>();
  private errorListeners = new Set<ErrorListener>();

  constructor(
    private readonly provider: FootballDataProvider,
    private readonly clock: EventMonitorClock = systemClock,
  ) {}

  start(fixtureIdsProvider: () => string[], intervalMs: number): void {
    if (this.handle !== null) {
      return; // already running - explicitly idempotent, no duplicate loops
    }
    const tick = (): void => {
      void this.poll(fixtureIdsProvider());
    };
    this.handle = this.clock.setInterval(tick, intervalMs);
    tick(); // poll immediately on start rather than waiting a full interval
  }

  stop(): void {
    if (this.handle !== null) {
      this.clock.clearInterval(this.handle);
      this.handle = null;
    }
  }

  isRunning(): boolean {
    return this.handle !== null;
  }

  onEvents(listener: EventMonitorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private async poll(fixtureIds: string[]): Promise<void> {
    if (this.pollInFlight || fixtureIds.length === 0) return;
    this.pollInFlight = true;
    try {
      const events = await this.provider.fetchEvents(fixtureIds);
      const fresh = events.filter((e) => !this.seenEventIds.has(e.id));
      for (const e of fresh) this.seenEventIds.add(e.id);
      if (fresh.length > 0) {
        for (const listener of this.listeners) listener(fresh);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const listener of this.errorListeners) listener(error);
    } finally {
      this.pollInFlight = false;
    }
  }
}

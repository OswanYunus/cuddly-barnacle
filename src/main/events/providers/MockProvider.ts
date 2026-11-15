import type { FootballEvent, ProviderStatus } from "@shared/types";
import type { FootballDataProvider } from "./FootballDataProvider";

/**
 * TEST-ONLY mock provider.
 *
 * This class exists purely so that OverlayScheduler/EventMonitor tests are
 * deterministic and do not depend on network access or real API credentials.
 *
 * It must never be wired up in production application code (main.ts), and
 * its name is deliberately prefixed so any accidental production usage is
 * obvious in logs and in the Settings → Event API screen, which displays
 * `provider.name` to the user.
 */
export class MockProviderForTestsOnly implements FootballDataProvider {
  readonly name = "MOCK PROVIDER (TEST FIXTURE - NOT LIVE DATA)";

  private queue: FootballEvent[] = [];
  private configured = true;

  isConfigured(): boolean {
    return this.configured;
  }

  setConfigured(value: boolean): void {
    this.configured = value;
  }

  /** Test helper: enqueue an event to be returned by the next fetchEvents call. */
  enqueue(event: FootballEvent): void {
    this.queue.push(event);
  }

  async fetchEvents(_fixtureIds: string[]): Promise<FootballEvent[]> {
    const batch = this.queue;
    this.queue = [];
    return batch;
  }

  getStatus(): ProviderStatus {
    return {
      providerName: this.name,
      isConfigured: this.configured,
      isReachable: true,
      lastPolledAt: Date.now(),
      lastError: null,
      rateLimitRemaining: null,
    };
  }
}

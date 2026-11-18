import type { Event, Relay as RelayInstance } from "nostr-tools";
import WebSocket from "ws";
import type { SharedLink, SharedMatchEntry } from "../../shared/types";

type NostrToolsModule = typeof import("nostr-tools");

// TypeScript compiles the Electron main process to CommonJS. Keep this import
// native so Node selects nostr-tools' ESM entry and avoids its incompatible
// CommonJS entry, which requires ESM-only @noble/curves modules.
const importEsm = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<NostrToolsModule>;

// Polyfill global WebSocket for Node environment if missing
if (!globalThis.WebSocket) {
  // @ts-expect-error ws WebSocket matches runtime interface
  globalThis.WebSocket = WebSocket;
}

const DEFAULT_RELAYS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.mom",
];

const MATCHVIEW_TAG = "matchview-live";
/** Matchday links expire after 14 hours (in seconds) */
const MATCHDAY_TTL_SECONDS = 14 * 3600;

export class GlobalDiscovery {
  private readonly nostrTools = importEsm("nostr-tools");
  private secretKey: Promise<Uint8Array> | null = null;
  private relays: RelayInstance[] = [];
  private onMatchesUpdated: (matches: SharedLink[]) => void;
  private matchesMap = new Map<string, SharedLink>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(onMatchesUpdated: (matches: SharedLink[]) => void) {
    this.onMatchesUpdated = onMatchesUpdated;

    void this.connectAndSubscribe();

    // Auto-clean expired matches every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.purgeExpiredMatches();
    }, 5 * 60 * 1000);
  }

  private async connectAndSubscribe(): Promise<void> {
    for (const url of DEFAULT_RELAYS) {
      if (this.destroyed) break;
      this.connectRelay(url).catch(() => {
        // Individual relay connect failure is handled gracefully
      });
    }
  }

  private async connectRelay(url: string): Promise<void> {
    try {
      const { Relay } = await this.nostrTools;
      const relay = await Relay.connect(url);
      if (this.destroyed) {
        relay.close();
        return;
      }
      this.relays.push(relay);

      const cutoffSeconds = Math.floor(Date.now() / 1000) - MATCHDAY_TTL_SECONDS;

      // Subscribe to active matchday links
      relay.subscribe(
        [
          {
            kinds: [1],
            "#t": [MATCHVIEW_TAG],
            since: cutoffSeconds,
            limit: 50,
          },
        ],
        {
          onevent: (ev: Event) => {
            this.handleIncomingEvent(ev);
          },
        },
      );
    } catch {
      // Ignore network errors; other relays will provide redundancy
    }
  }

  private handleIncomingEvent(ev: { id: string; created_at: number; content: string }): void {
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Ignore events older than the matchday TTL
    if (ev.created_at < nowSeconds - MATCHDAY_TTL_SECONDS) {
      return;
    }

    try {
      const data = JSON.parse(ev.content) as { label?: string; url?: string; author?: string };
      if (!data.label || !data.url) return;

      const sharedLink: SharedLink = {
        id: `global-${ev.id.slice(0, 10)}`,
        label: data.label,
        url: data.url,
        source: data.author ? `Global (${data.author})` : "Global",
        createdAt: ev.created_at * 1000,
      };

      if (!this.matchesMap.has(sharedLink.id)) {
        this.matchesMap.set(sharedLink.id, sharedLink);
        this.emit();
      }
    } catch {
      // Ignore unparseable content
    }
  }

  /**
   * Publish a match link globally to all connected relays.
   * Auto-expires in 14 hours.
   */
  async publishMatch(label: string, url: string, author = "Viewer"): Promise<void> {
    const [{ finalizeEvent }, secretKey] = await Promise.all([
      this.nostrTools,
      this.getSecretKey(),
    ]);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowSeconds + MATCHDAY_TTL_SECONDS;

    const event = finalizeEvent(
      {
        kind: 1,
        created_at: nowSeconds,
        tags: [
          ["t", MATCHVIEW_TAG],
          ["expiration", String(expiresAt)],
        ],
        content: JSON.stringify({ label, url, author }),
      },
      secretKey,
    );

    // Add locally immediately so the author sees it without network roundtrip delay
    const localLink: SharedLink = {
      id: `global-${event.id.slice(0, 10)}`,
      label,
      url,
      source: "You (Global)",
      createdAt: nowSeconds * 1000,
    };
    this.matchesMap.set(localLink.id, localLink);
    this.emit();

    // Broadcast across all connected relays in parallel
    const publishPromises = this.relays.map((r) =>
      r.publish(event).catch(() => {
        // Individual relay publish failures are ignored
      }),
    );
    await Promise.allSettled(publishPromises);
  }

  /**
   * Publish multiple matches at once
   */
  async publishMatches(matches: SharedMatchEntry[], author = "Viewer"): Promise<void> {
    for (const m of matches) {
      await this.publishMatch(m.label, m.url, author);
    }
  }

  getMatches(): SharedLink[] {
    this.purgeExpiredMatches();
    return [...this.matchesMap.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  private purgeExpiredMatches(): void {
    const cutoffMs = Date.now() - MATCHDAY_TTL_SECONDS * 1000;
    let changed = false;
    for (const [id, link] of this.matchesMap) {
      if (link.createdAt < cutoffMs) {
        this.matchesMap.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  }

  private emit(): void {
    this.onMatchesUpdated(this.getMatches());
  }

  close(): void {
    this.destroyed = true;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const r of this.relays) {
      try {
        r.close();
      } catch {
        // ignore
      }
    }
    this.relays = [];
  }

  private getSecretKey(): Promise<Uint8Array> {
    this.secretKey ??= this.nostrTools.then(({ generateSecretKey }) => generateSecretKey());
    return this.secretKey;
  }
}

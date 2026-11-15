import { createSocket, type Socket } from "node:dgram";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type { DiscoveredSession, SharedMatchEntry } from "../../shared/types";

const MULTICAST_ADDR = "239.255.42.99";
const PORT = 47698;
const BROADCAST_INTERVAL_MS = 5000;
/** Peer is considered stale after 15 s without a heartbeat */
const PEER_TTL_MS = 15000;

export class LanDiscovery {
  private socket: Socket;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private pruneInterval: NodeJS.Timeout | null = null;
  private readonly peerId = randomUUID();
  private peers = new Map<string, DiscoveredSession & { _seenAt: number }>();
  private readonly onPeersChanged: (peers: DiscoveredSession[]) => void;
  private bound = false;

  constructor(onPeersChanged: (peers: DiscoveredSession[]) => void) {
    this.onPeersChanged = onPeersChanged;
    this.socket = createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", () => { /* ignore network errors silently */ });

    this.socket.bind(PORT, () => {
      try {
        this.socket.addMembership(MULTICAST_ADDR);
        this.socket.setMulticastLoopback(false);
        this.bound = true;
      } catch { /* multicast may not be available on all interfaces */ }
    });

    this.socket.on("message", (msg) => {
      try {
        const payload = JSON.parse(msg.toString()) as DiscoveredSession;
        if (payload.id === this.peerId) return; // own broadcast
        this.peers.set(payload.id, { ...payload, _seenAt: Date.now() });
        this.emit();
      } catch { /* ignore malformed packets */ }
    });

    // Prune stale peers every 5 s
    this.pruneInterval = setInterval(() => {
      const cutoff = Date.now() - PEER_TTL_MS;
      let changed = false;
      for (const [id, peer] of this.peers) {
        if (peer._seenAt < cutoff) { this.peers.delete(id); changed = true; }
      }
      if (changed) this.emit();
    }, 5000);
  }

  startBroadcasting(matches: SharedMatchEntry[]): void {
    this.stopBroadcasting();
    const send = () => {
      if (!this.bound) return;
      const payload: DiscoveredSession = {
        id: this.peerId,
        hostName: hostname(),
        sharedAt: Date.now(),
        matches,
      };
      const msg = Buffer.from(JSON.stringify(payload));
      this.socket.send(msg, 0, msg.length, PORT, MULTICAST_ADDR, () => { /* ignore */ });
    };
    send();
    this.broadcastInterval = setInterval(send, BROADCAST_INTERVAL_MS);
  }

  stopBroadcasting(): void {
    if (this.broadcastInterval) { clearInterval(this.broadcastInterval); this.broadcastInterval = null; }
  }

  close(): void {
    this.stopBroadcasting();
    if (this.pruneInterval) { clearInterval(this.pruneInterval); this.pruneInterval = null; }
    try { this.socket.close(); } catch { /* ignore */ }
  }

  /** Encode a match list as a portable share code (base64 JSON) */
  static generateShareCode(matches: SharedMatchEntry[]): string {
    return Buffer.from(JSON.stringify(matches)).toString("base64url");
  }

  /** Decode a share code back into a match list, throws on invalid input */
  static decodeShareCode(code: string): SharedMatchEntry[] {
    const raw = Buffer.from(code.trim(), "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid share code");
    return parsed as SharedMatchEntry[];
  }

  private emit(): void {
    this.onPeersChanged([...this.peers.values()]);
  }
}

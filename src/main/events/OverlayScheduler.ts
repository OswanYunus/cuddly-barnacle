import type {
  EventSettings,
  FootballEvent,
  MatchSource,
  ScheduledOverlay,
} from "@shared/types";

export interface OverlayClock {
  now(): number;
}

export const systemOverlayClock: OverlayClock = { now: () => Date.now() };

export interface OverlaySchedulerCallbacks {
  /** Fired when an overlay should actually be displayed in the renderer. */
  onShow: (overlay: ScheduledOverlay) => void;
  /** Fired when the previous layout should be restored (overlay ended/dismissed). */
  onRestore: (overlay: ScheduledOverlay) => void;
  /** Fired whenever the pending queue changes, for UI display in Event Management. */
  onQueueChanged: (queue: ScheduledOverlay[]) => void;
}

let overlayCounter = 0;
function nextOverlayId(): string {
  overlayCounter += 1;
  return `overlay-${overlayCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * OverlayScheduler
 * ----------------
 * Converts incoming FootballEvents into scheduled, time-delayed overlay
 * presentations, enforcing:
 *   - eventDelayMs + manualStreamOffsetMs before an overlay is allowed to
 *     show at all (accounts for provider-vs-stream latency - see
 *     docs in FootballDataProvider.ts and the Settings → Synchronization
 *     screen).
 *   - only one overlay visible at a time; others queue (no chaotic
 *     simultaneous overlays).
 *   - duplicate protection: the same FootballEvent.id is never scheduled
 *     twice.
 *   - user-configurable interruption rules (primary match protection,
 *     whether lower-priority goals may interrupt higher-priority ones).
 *   - manual dismissal and pausing.
 *
 * This class holds no timers of its own; the caller drives it with
 * `tick()` on a regular interval (e.g. every 250ms from the main process),
 * which makes behaviour fully deterministic and unit-testable with a fake
 * clock - no real setTimeout/setInterval anywhere in this file.
 */
export class OverlayScheduler {
  private queue: ScheduledOverlay[] = [];
  private current: ScheduledOverlay | null = null;
  private scheduledEventIds = new Set<string>();
  private paused = false;

  constructor(
    private settings: EventSettings,
    private readonly getMatch: (matchId: string) => MatchSource | undefined,
    private readonly getCurrentPrimaryMatchId: () => string | null,
    private readonly callbacks: OverlaySchedulerCallbacks,
    private readonly clock: OverlayClock = systemOverlayClock,
  ) {}

  updateSettings(settings: EventSettings): void {
    this.settings = settings;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getQueue(): ScheduledOverlay[] {
    return [...this.queue];
  }

  getCurrent(): ScheduledOverlay | null {
    return this.current;
  }

  /**
   * Submit a newly-detected event for possible overlay scheduling.
   * Returns the ScheduledOverlay record (queued or suppressed) or null if
   * the event type is not enabled for overlays at all.
   */
  submit(event: FootballEvent, matchId: string): ScheduledOverlay | null {
    if (!this.settings.triggerTypes.includes(event.type)) {
      return null;
    }
    if (this.scheduledEventIds.has(event.id)) {
      return null; // duplicate protection
    }
    this.scheduledEventIds.add(event.id);

    const baseTime = event.occurredAt ?? event.reportedAt;
    const dueAt = baseTime + this.settings.eventDelayMs + this.settings.manualStreamOffsetMs;

    const overlay: ScheduledOverlay = {
      id: nextOverlayId(),
      event,
      matchId,
      dueAt,
      expiresAt: null,
      state: "queued",
      suppressedReason: null,
    };

    if (!this.settings.automaticOverlaysEnabled) {
      overlay.state = "suppressed";
      overlay.suppressedReason = "Automatic overlays are disabled";
      this.emitQueueChanged();
      return overlay;
    }

    this.queue.push(overlay);
    this.sortQueue();
    this.emitQueueChanged();
    return overlay;
  }

  /** Must be called periodically (e.g. every 250ms) by the host process. */
  tick(): void {
    const now = this.clock.now();

    // Expire the currently showing overlay if its duration elapsed.
    if (this.current && this.current.expiresAt !== null && now >= this.current.expiresAt) {
      const finished = this.current;
      finished.state = "expired";
      this.current = null;
      this.callbacks.onRestore(finished);
    }

    if (this.paused) return;
    if (this.current !== null) return; // one overlay at a time, by design

    const dueIndex = this.queue.findIndex((o) => o.dueAt <= now && o.state === "queued");
    if (dueIndex === -1) return;

    const candidate = this.queue[dueIndex]!;
    const decision = this.evaluateInterruptRules(candidate);

    if (!decision.allowed) {
      candidate.state = "suppressed";
      candidate.suppressedReason = decision.reason;
      this.queue.splice(dueIndex, 1);
      this.emitQueueChanged();
      return;
    }

    this.queue.splice(dueIndex, 1);
    candidate.state = "showing";
    candidate.expiresAt = now + this.settings.overlayDurationMs;
    this.current = candidate;
    this.callbacks.onShow(candidate);
    this.emitQueueChanged();
  }

  /** User-initiated early dismissal. */
  dismiss(overlayId: string): void {
    if (this.current && this.current.id === overlayId) {
      const dismissed = this.current;
      dismissed.state = "dismissed";
      this.current = null;
      this.callbacks.onRestore(dismissed);
      return;
    }
    const idx = this.queue.findIndex((o) => o.id === overlayId);
    if (idx !== -1) {
      this.queue[idx]!.state = "dismissed";
      this.queue.splice(idx, 1);
      this.emitQueueChanged();
    }
  }

  /** Remove all pending (not-yet-shown) overlays, e.g. when the user ends the session. */
  clearQueue(): void {
    this.queue = [];
    this.emitQueueChanged();
  }

  private evaluateInterruptRules(candidate: ScheduledOverlay): {
    allowed: boolean;
    reason: string | null;
  } {
    const primaryMatchId = this.getCurrentPrimaryMatchId();
    const candidateMatch = this.getMatch(candidate.matchId);

    if (
      this.settings.primaryMatchIsProtected &&
      primaryMatchId !== null &&
      primaryMatchId === candidate.matchId
    ) {
      // The event is FOR the primary match itself - protection is about not
      // interrupting the user's primary view with an overlay from elsewhere,
      // so an event belonging to the primary match is never "interrupting".
      return { allowed: true, reason: null };
    }

    if (this.settings.primaryMatchIsProtected && primaryMatchId !== null) {
      // An overlay for a non-primary match would cover the protected primary match.
      return {
        allowed: false,
        reason: "Primary match is protected from interruption (Settings → Event Rules)",
      };
    }

    if (!this.settings.lowerPriorityCanInterrupt && primaryMatchId !== null && candidateMatch) {
      const primaryMatch = this.getMatch(primaryMatchId);
      if (primaryMatch && candidateMatch.priority > primaryMatch.priority) {
        return {
          allowed: false,
          reason: "Lower-priority matches are not allowed to interrupt (Settings → Event Rules)",
        };
      }
    }

    return { allowed: true, reason: null };
  }

  private sortQueue(): void {
    // Highest-priority match's events shown first when multiple are due
    // simultaneously; ties broken by due time (earlier first).
    this.queue.sort((a, b) => {
      const matchA = this.getMatch(a.matchId);
      const matchB = this.getMatch(b.matchId);
      const prioDiff = (matchA?.priority ?? 99) - (matchB?.priority ?? 99);
      if (prioDiff !== 0) return prioDiff;
      return a.dueAt - b.dueAt;
    });
  }

  private emitQueueChanged(): void {
    this.callbacks.onQueueChanged(this.getQueue());
  }
}

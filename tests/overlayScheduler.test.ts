import { OverlayScheduler, type OverlayClock } from "@main/events/OverlayScheduler";
import { DEFAULT_EVENT_SETTINGS, type EventSettings, type FootballEvent, type MatchSource } from "@shared/types";

function makeMatch(id: string, priority: 1 | 2 | 3 | 4 | 5): MatchSource {
  return {
    id,
    label: id,
    homeTeam: "A",
    awayTeam: "B",
    url: "https://example.com",
    priority,
    streamMode: "embedded",
    providerFixtureId: id,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeEvent(id: string, overrides: Partial<FootballEvent> = {}): FootballEvent {
  return {
    id,
    providerFixtureId: "fixture-1",
    type: "goal",
    minute: 42,
    team: "home",
    playerName: "Test Player",
    occurredAt: 1_000_000,
    reportedAt: 1_000_020,
    ...overrides,
  };
}

class FakeClock implements OverlayClock {
  private t = 1_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(t: number): void {
    this.t = t;
  }
}

function buildScheduler(
  settingsOverrides: Partial<EventSettings>,
  matches: MatchSource[],
  clock: FakeClock,
  primaryMatchId: string | null = null,
) {
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const shown: string[] = [];
  const restored: string[] = [];
  const queues: number[] = [];

  const scheduler = new OverlayScheduler(
    { ...DEFAULT_EVENT_SETTINGS, ...settingsOverrides },
    (id) => matchMap.get(id),
    () => primaryMatchId,
    {
      onShow: (o) => shown.push(o.matchId),
      onRestore: (o) => restored.push(o.matchId),
      onQueueChanged: (q) => queues.push(q.length),
    },
    clock,
  );
  return { scheduler, shown, restored, queues };
}

describe("OverlayScheduler - basic delay and display", () => {
  test("does not show overlay before dueAt (event delay respected)", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler({ eventDelayMs: 15000, manualStreamOffsetMs: 0 }, [makeMatch("m1", 1)], clock);
    scheduler.submit(makeEvent("e1"), "m1");
    scheduler.tick();
    expect(shown).toHaveLength(0); // dueAt = 1,000,000 + 15000 = 1,015,000; now is 1,000,000
  });

  test("shows overlay once dueAt has passed", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler({ eventDelayMs: 15000 }, [makeMatch("m1", 1)], clock);
    scheduler.submit(makeEvent("e1"), "m1");
    clock.advance(16000);
    scheduler.tick();
    expect(shown).toEqual(["m1"]);
  });

  test("restores after overlayDurationMs elapses", () => {
    const clock = new FakeClock();
    const { scheduler, shown, restored } = buildScheduler(
      { eventDelayMs: 1000, overlayDurationMs: 5000 },
      [makeMatch("m1", 1)],
      clock,
    );
    scheduler.submit(makeEvent("e1"), "m1");
    clock.advance(1500);
    scheduler.tick();
    expect(shown).toEqual(["m1"]);
    clock.advance(4000);
    scheduler.tick(); // not yet expired (4000 < 5000 since show)
    expect(restored).toHaveLength(0);
    clock.advance(1500);
    scheduler.tick();
    expect(restored).toEqual(["m1"]);
  });
});

describe("OverlayScheduler - duplicate protection", () => {
  test("ignores a second submission of the same event id", () => {
    const clock = new FakeClock();
    const { scheduler, queues } = buildScheduler({ eventDelayMs: 0 }, [makeMatch("m1", 1)], clock);
    const first = scheduler.submit(makeEvent("e1"), "m1");
    const second = scheduler.submit(makeEvent("e1"), "m1");
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(scheduler.getQueue()).toHaveLength(1);
    expect(queues).not.toHaveLength(0);
  });
});

describe("OverlayScheduler - multiple goals / queueing (no chaotic overlap)", () => {
  test("only one overlay shows at a time; second waits in queue", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler(
      { eventDelayMs: 0, overlayDurationMs: 10000 },
      [makeMatch("m1", 1), makeMatch("m2", 2)],
      clock,
    );
    scheduler.submit(makeEvent("e1", { providerFixtureId: "m1" }), "m1");
    scheduler.submit(makeEvent("e2", { providerFixtureId: "m2" }), "m2");
    scheduler.tick(); // both due, only highest priority (m1) shows
    expect(shown).toEqual(["m1"]);
    expect(scheduler.getQueue()).toHaveLength(1); // m2 still queued

    clock.advance(10001);
    scheduler.tick(); // m1 expires and restores
    scheduler.tick(); // m2 now shows
    expect(shown).toEqual(["m1", "m2"]);
  });

  test("higher priority match's event is shown first when both are due simultaneously", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler(
      { eventDelayMs: 0 },
      [makeMatch("low", 3), makeMatch("high", 1)],
      clock,
    );
    scheduler.submit(makeEvent("e-low"), "low");
    scheduler.submit(makeEvent("e-high"), "high");
    scheduler.tick();
    expect(shown).toEqual(["high"]);
  });
});

describe("OverlayScheduler - dismissal", () => {
  test("dismissing the currently showing overlay restores immediately", () => {
    const clock = new FakeClock();
    const { scheduler, shown, restored } = buildScheduler({ eventDelayMs: 0 }, [makeMatch("m1", 1)], clock);
    const overlay = scheduler.submit(makeEvent("e1"), "m1")!;
    scheduler.tick();
    expect(shown).toEqual(["m1"]);
    scheduler.dismiss(overlay.id);
    expect(restored).toEqual(["m1"]);
    expect(scheduler.getCurrent()).toBeNull();
  });

  test("dismissing a queued (not yet shown) overlay removes it from the queue", () => {
    const clock = new FakeClock();
    const { scheduler } = buildScheduler({ eventDelayMs: 60000 }, [makeMatch("m1", 1)], clock);
    const overlay = scheduler.submit(makeEvent("e1"), "m1")!;
    expect(scheduler.getQueue()).toHaveLength(1);
    scheduler.dismiss(overlay.id);
    expect(scheduler.getQueue()).toHaveLength(0);
  });
});

describe("OverlayScheduler - interruption rules", () => {
  test("protected primary match suppresses an overlay from another match", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler(
      { eventDelayMs: 0, primaryMatchIsProtected: true },
      [makeMatch("primary", 1), makeMatch("other", 2)],
      clock,
      "primary",
    );
    scheduler.submit(makeEvent("e1"), "other");
    scheduler.tick();
    expect(shown).toHaveLength(0);
    expect(scheduler.getQueue()).toHaveLength(0); // suppressed, removed from queue
  });

  test("protected primary match is NOT suppressed for its own event", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler(
      { eventDelayMs: 0, primaryMatchIsProtected: true },
      [makeMatch("primary", 1)],
      clock,
      "primary",
    );
    scheduler.submit(makeEvent("e1"), "primary");
    scheduler.tick();
    expect(shown).toEqual(["primary"]);
  });

  test("lowerPriorityCanInterrupt=false blocks a lower-priority match from interrupting the primary", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler(
      { eventDelayMs: 0, lowerPriorityCanInterrupt: false },
      [makeMatch("primary", 1), makeMatch("other", 3)],
      clock,
      "primary",
    );
    scheduler.submit(makeEvent("e1"), "other");
    scheduler.tick();
    expect(shown).toHaveLength(0);
  });

  test("disabling automatic overlays suppresses events immediately on submit", () => {
    const clock = new FakeClock();
    const { scheduler } = buildScheduler({ automaticOverlaysEnabled: false }, [makeMatch("m1", 1)], clock);
    const overlay = scheduler.submit(makeEvent("e1"), "m1");
    expect(overlay?.state).toBe("suppressed");
    expect(scheduler.getQueue()).toHaveLength(0);
  });

  test("pausing prevents tick from showing anything until resumed", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler({ eventDelayMs: 0 }, [makeMatch("m1", 1)], clock);
    scheduler.setPaused(true);
    scheduler.submit(makeEvent("e1"), "m1");
    scheduler.tick();
    expect(shown).toHaveLength(0);
    scheduler.setPaused(false);
    scheduler.tick();
    expect(shown).toEqual(["m1"]);
  });

  test("event type not in triggerTypes is never scheduled", () => {
    const clock = new FakeClock();
    const { scheduler } = buildScheduler({ triggerTypes: ["goal"] }, [makeMatch("m1", 1)], clock);
    const result = scheduler.submit(makeEvent("e1", { type: "red_card" }), "m1");
    expect(result).toBeNull();
  });
});

describe("OverlayScheduler - manual calibration offset", () => {
  test("manualStreamOffsetMs is added on top of eventDelayMs", () => {
    const clock = new FakeClock();
    const { scheduler, shown } = buildScheduler(
      { eventDelayMs: 1000, manualStreamOffsetMs: 240000 }, // simulate ~4 min stream delay
      [makeMatch("m1", 1)],
      clock,
    );
    scheduler.submit(makeEvent("e1"), "m1");
    clock.advance(200000);
    scheduler.tick();
    expect(shown).toHaveLength(0); // still within the 241s total delay
    clock.advance(42000);
    scheduler.tick();
    expect(shown).toEqual(["m1"]);
  });
});

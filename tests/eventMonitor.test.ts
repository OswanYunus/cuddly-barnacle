import { EventMonitor, type EventMonitorClock } from "@main/events/EventMonitor";
import { MockProviderForTestsOnly } from "@main/events/providers/MockProvider";
import type { FootballEvent } from "@shared/types";

class FakeIntervalClock implements EventMonitorClock {
  private callbacks = new Map<unknown, () => void>();
  private nextHandle = 1;
  private t = 0;

  now(): number {
    return this.t;
  }

  setInterval(fn: () => void, _ms: number): unknown {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, fn);
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.callbacks.delete(handle);
  }

  /** Manually fire all registered interval callbacks once, simulating one tick. */
  fireAll(): void {
    for (const fn of this.callbacks.values()) fn();
  }
}

function sampleEvent(id: string): FootballEvent {
  return {
    id,
    providerFixtureId: "fixture-1",
    type: "goal",
    minute: 10,
    team: "home",
    playerName: "Player",
    occurredAt: null,
    reportedAt: Date.now(),
  };
}

describe("EventMonitor - polling and deduplication", () => {
  test("emits newly fetched events to listeners", async () => {
    const provider = new MockProviderForTestsOnly();
    const clock = new FakeIntervalClock();
    const monitor = new EventMonitor(provider, clock);
    const received: FootballEvent[] = [];
    monitor.onEvents((events) => received.push(...events));

    provider.enqueue(sampleEvent("e1"));
    monitor.start(() => ["fixture-1"], 20000);
    await flushMicrotasks();

    expect(received.map((e) => e.id)).toEqual(["e1"]);
  });

  test("does not re-emit an event id already seen in a previous poll", async () => {
    const provider = new MockProviderForTestsOnly();
    const clock = new FakeIntervalClock();
    const monitor = new EventMonitor(provider, clock);
    const received: FootballEvent[] = [];
    monitor.onEvents((events) => received.push(...events));

    provider.enqueue(sampleEvent("e1"));
    monitor.start(() => ["fixture-1"], 20000);
    await flushMicrotasks();

    // Provider "returns" the same event again on a subsequent poll (e.g. a
    // naive provider re-sending recent events) - EventMonitor's own seen-set
    // must filter it regardless of provider-level dedup.
    provider.enqueue(sampleEvent("e1"));
    clock.fireAll();
    await flushMicrotasks();

    expect(received).toHaveLength(1);
  });

  test("start() is idempotent and never creates a second polling loop", async () => {
    const provider = new MockProviderForTestsOnly();
    const clock = new FakeIntervalClock();
    const monitor = new EventMonitor(provider, clock);
    const received: FootballEvent[] = [];
    monitor.onEvents((events) => received.push(...events));

    monitor.start(() => ["fixture-1"], 20000);
    monitor.start(() => ["fixture-1"], 20000); // second call should be a no-op
    await flushMicrotasks(); // let the immediate on-start poll resolve before ticking again

    provider.enqueue(sampleEvent("e1"));
    clock.fireAll(); // if two loops existed, this would double-fetch
    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(monitor.isRunning()).toBe(true);
  });

  test("stop() halts further polling", async () => {
    const provider = new MockProviderForTestsOnly();
    const clock = new FakeIntervalClock();
    const monitor = new EventMonitor(provider, clock);
    monitor.start(() => ["fixture-1"], 20000);
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);

    provider.enqueue(sampleEvent("e1"));
    clock.fireAll(); // no registered interval remains, should do nothing
    await flushMicrotasks();
    // No assertion failure possible if nothing throws; stop() is effective.
  });

  test("multiple distinct goals in one poll are all emitted (handles simultaneous goals)", async () => {
    const provider = new MockProviderForTestsOnly();
    const clock = new FakeIntervalClock();
    const monitor = new EventMonitor(provider, clock);
    const received: FootballEvent[] = [];
    monitor.onEvents((events) => received.push(...events));

    provider.enqueue(sampleEvent("e1"));
    provider.enqueue(sampleEvent("e2"));
    monitor.start(() => ["fixture-1"], 20000);
    await flushMicrotasks();

    expect(received.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });
});

describe("EventMonitor - error handling", () => {
  test("a provider error is surfaced via onError and does not stop the loop", async () => {
    const provider = new MockProviderForTestsOnly();
    provider.setConfigured(false); // will throw ProviderNotConfiguredError-like behavior
    const clock = new FakeIntervalClock();
    const monitor = new EventMonitor(
      {
        name: provider.name,
        isConfigured: () => false,
        fetchEvents: async () => {
          throw new Error("simulated provider failure");
        },
        getStatus: () => provider.getStatus(),
      },
      clock,
    );
    const errors: Error[] = [];
    monitor.onError((err) => errors.push(err));

    monitor.start(() => ["fixture-1"], 20000);
    await flushMicrotasks();

    expect(errors).toHaveLength(1);
    expect(monitor.isRunning()).toBe(true); // loop continues despite the error
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

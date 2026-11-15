import { MonitorService, MonitorUnavailableError, type ElectronDisplay, type ScreenLike } from "@main/monitors/MonitorService";

function makeDisplay(id: number, overrides: Partial<ElectronDisplay> = {}): ElectronDisplay {
  return {
    id,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    rotation: 0,
    ...overrides,
  };
}

class FakeScreen implements ScreenLike {
  displays: ElectronDisplay[];
  primaryId: number;
  private listeners: Array<() => void> = [];

  constructor(displays: ElectronDisplay[], primaryId: number) {
    this.displays = displays;
    this.primaryId = primaryId;
  }

  getAllDisplays(): ElectronDisplay[] {
    return this.displays;
  }

  getPrimaryDisplay(): ElectronDisplay {
    return this.displays.find((d) => d.id === this.primaryId)!;
  }

  onDisplayChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  disconnect(id: number): void {
    this.displays = this.displays.filter((d) => d.id !== id);
    this.listeners.forEach((l) => l());
  }

  changeResolution(id: number, width: number, height: number): void {
    this.displays = this.displays.map((d) => (d.id === id ? { ...d, bounds: { ...d.bounds, width, height } } : d));
    this.listeners.forEach((l) => l());
  }
}

describe("MonitorService - single monitor", () => {
  test("lists the single monitor as primary", () => {
    const fake = new FakeScreen([makeDisplay(1)], 1);
    const service = new MonitorService(fake);
    const monitors = service.listMonitors();
    expect(monitors).toHaveLength(1);
    expect(monitors[0]!.isPrimary).toBe(true);
  });
});

describe("MonitorService - multiple monitors", () => {
  test("lists all monitors and correctly flags the primary one", () => {
    const fake = new FakeScreen([makeDisplay(1), makeDisplay(2, { bounds: { x: 1920, y: 0, width: 1366, height: 768 } })], 1);
    const service = new MonitorService(fake);
    const monitors = service.listMonitors();
    expect(monitors).toHaveLength(2);
    expect(monitors.filter((m) => m.isPrimary)).toHaveLength(1);
  });

  test("selecting a valid monitor id succeeds", () => {
    const fake = new FakeScreen([makeDisplay(1), makeDisplay(2)], 1);
    const service = new MonitorService(fake);
    const selected = service.selectMonitor(2);
    expect(selected.id).toBe(2);
    expect(service.getSelectedMonitor()?.id).toBe(2);
  });

  test("selecting an invalid monitor id throws MonitorUnavailableError", () => {
    const fake = new FakeScreen([makeDisplay(1)], 1);
    const service = new MonitorService(fake);
    expect(() => service.selectMonitor(999)).toThrow(MonitorUnavailableError);
  });
});

describe("MonitorService - disconnection handling", () => {
  test("falls back gracefully when the selected monitor disconnects", () => {
    const fake = new FakeScreen([makeDisplay(1), makeDisplay(2)], 1);
    const service = new MonitorService(fake);
    service.start();
    service.selectMonitor(2);
    expect(service.getSelectedMonitor()?.id).toBe(2);

    fake.disconnect(2);

    expect(service.getSelectedMonitor()).toBeNull(); // no stale/off-screen reference
    service.stop();
  });

  test("notifies listeners on display change (e.g. resolution change)", () => {
    const fake = new FakeScreen([makeDisplay(1)], 1);
    const service = new MonitorService(fake);
    const received: number[] = [];
    service.start();
    service.onChange((monitors) => received.push(monitors[0]!.bounds.width));

    fake.changeResolution(1, 1366, 768);

    expect(received).toContain(1366);
    service.stop();
  });

  test("does not throw or crash when no monitors are connected", () => {
    const fake = new FakeScreen([], -1);
    const service = new MonitorService(fake);
    expect(() => service.listMonitors()).not.toThrow();
    expect(service.listMonitors()).toHaveLength(0);
  });
});

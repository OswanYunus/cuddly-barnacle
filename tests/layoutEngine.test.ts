import { computeLayout, computeOverlayLayout, recommendedLayoutForCount } from "@renderer/layout/LayoutEngine";
import type { MatchSource } from "@shared/types";

function matchesOf(count: number): Pick<MatchSource, "id" | "priority">[] {
  return Array.from({ length: count }, (_, i) => ({ id: `m${i + 1}`, priority: (i + 1) as 1 }));
}

function rectsDoNotOverlap(rects: Array<{ x: number; y: number; width: number; height: number }>) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap = !(
        a.x + a.width <= b.x + 0.01 ||
        b.x + b.width <= a.x + 0.01 ||
        a.y + a.height <= b.y + 0.01 ||
        b.y + b.height <= a.y + 0.01
      );
      expect(overlap).toBe(false);
    }
  }
}

function allWithinBounds(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  width: number,
  height: number,
) {
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(width + 0.5);
    expect(r.y + r.height).toBeLessThanOrEqual(height + 0.5);
  }
}

const RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 800, height: 600 },
];

describe("LayoutEngine - two matches", () => {
  for (const res of RESOLUTIONS) {
    test(`horizontal split has no overlap/clipping at ${res.width}x${res.height}`, () => {
      const layout = computeLayout({
        kind: "two-horizontal",
        containerWidth: res.width,
        containerHeight: res.height,
        matches: matchesOf(2),
      });
      expect(layout.slots).toHaveLength(2);
      rectsDoNotOverlap(layout.slots.map((s) => s.rect));
      allWithinBounds(layout.slots.map((s) => s.rect), res.width, res.height);
    });

    test(`vertical split has no overlap/clipping at ${res.width}x${res.height}`, () => {
      const layout = computeLayout({
        kind: "two-vertical",
        containerWidth: res.width,
        containerHeight: res.height,
        matches: matchesOf(2),
      });
      rectsDoNotOverlap(layout.slots.map((s) => s.rect));
      allWithinBounds(layout.slots.map((s) => s.rect), res.width, res.height);
    });
  }

  test("priority 1 match receives the primary slot in two-horizontal", () => {
    const layout = computeLayout({
      kind: "two-horizontal",
      containerWidth: 1920,
      containerHeight: 1080,
      matches: [
        { id: "low", priority: 2 },
        { id: "high", priority: 1 },
      ],
    });
    const primarySlot = layout.slots.find((s) => s.isPrimary);
    expect(primarySlot?.matchId).toBe("high");
  });

  test("custom split ratio is respected and clamped", () => {
    const layout = computeLayout({
      kind: "two-custom",
      containerWidth: 1000,
      containerHeight: 500,
      matches: matchesOf(2),
      customSplitRatio: 0.9, // should clamp to 0.8
    });
    const primary = layout.slots.find((s) => s.isPrimary)!;
    expect(primary.rect.width).toBeCloseTo(1000 * 0.8 - 2, 0);
  });
});

describe("LayoutEngine - three matches", () => {
  for (const res of RESOLUTIONS) {
    test(`three-primary layout valid at ${res.width}x${res.height}`, () => {
      const layout = computeLayout({
        kind: "three-primary",
        containerWidth: res.width,
        containerHeight: res.height,
        matches: matchesOf(3),
      });
      expect(layout.slots).toHaveLength(3);
      rectsDoNotOverlap(layout.slots.map((s) => s.rect));
      allWithinBounds(layout.slots.map((s) => s.rect), res.width, res.height);
      const primary = layout.slots.find((s) => s.isPrimary)!;
      // Primary should occupy roughly 60% of width
      expect(primary.rect.width / res.width).toBeGreaterThan(0.5);
    });
  }

  test("three-equal layout gives all matches equal width", () => {
    const layout = computeLayout({
      kind: "three-equal",
      containerWidth: 1920,
      containerHeight: 1080,
      matches: matchesOf(3),
    });
    const widths = layout.slots.map((s) => s.rect.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  });

  test("throws if given wrong match count", () => {
    expect(() =>
      computeLayout({
        kind: "three-primary",
        containerWidth: 1920,
        containerHeight: 1080,
        matches: matchesOf(2),
      }),
    ).toThrow();
  });
});

describe("LayoutEngine - four matches", () => {
  for (const res of RESOLUTIONS) {
    test(`four-grid layout valid at ${res.width}x${res.height}`, () => {
      const layout = computeLayout({
        kind: "four-grid",
        containerWidth: res.width,
        containerHeight: res.height,
        matches: matchesOf(4),
      });
      expect(layout.slots).toHaveLength(4);
      rectsDoNotOverlap(layout.slots.map((s) => s.rect));
      allWithinBounds(layout.slots.map((s) => s.rect), res.width, res.height);
      // All four quadrants should be approximately equal size
      const areas = layout.slots.map((s) => s.rect.width * s.rect.height);
      const avg = areas.reduce((a, b) => a + b, 0) / areas.length;
      for (const area of areas) {
        expect(Math.abs(area - avg) / avg).toBeLessThan(0.05);
      }
    });
  }
});

describe("LayoutEngine - five matches", () => {
  for (const res of RESOLUTIONS) {
    test(`five-primary layout valid at ${res.width}x${res.height}`, () => {
      const layout = computeLayout({
        kind: "five-primary",
        containerWidth: res.width,
        containerHeight: res.height,
        matches: matchesOf(5),
      });
      expect(layout.slots).toHaveLength(5);
      rectsDoNotOverlap(layout.slots.map((s) => s.rect));
      allWithinBounds(layout.slots.map((s) => s.rect), res.width, res.height);
    });
  }

  test("warns critically at 800x600 with five matches (small viewing areas)", () => {
    const layout = computeLayout({
      kind: "five-primary",
      containerWidth: 800,
      containerHeight: 600,
      matches: matchesOf(5),
    });
    expect(layout.warnings.some((w) => w.severity === "warning" || w.severity === "critical")).toBe(
      true,
    );
  });

  test("does NOT warn at 1920x1080 with two matches (plenty of space)", () => {
    const layout = computeLayout({
      kind: "two-horizontal",
      containerWidth: 1920,
      containerHeight: 1080,
      matches: matchesOf(2),
    });
    expect(layout.warnings).toHaveLength(0);
  });
});

describe("LayoutEngine - custom layout validation", () => {
  test("rejects overlapping custom slots", () => {
    expect(() =>
      computeLayout({
        kind: "custom",
        containerWidth: 1000,
        containerHeight: 1000,
        matches: matchesOf(2),
        customSlots: [
          { matchId: "m1", rect: { x: 0, y: 0, width: 600, height: 600 }, isPrimary: true },
          { matchId: "m2", rect: { x: 500, y: 0, width: 500, height: 500 }, isPrimary: false },
        ],
      }),
    ).toThrow(/overlap/);
  });

  test("rejects out-of-bounds custom slots", () => {
    expect(() =>
      computeLayout({
        kind: "custom",
        containerWidth: 1000,
        containerHeight: 1000,
        matches: matchesOf(1),
        customSlots: [
          { matchId: "m1", rect: { x: 900, y: 0, width: 200, height: 200 }, isPrimary: true },
        ],
      }),
    ).toThrow(/out of bounds/);
  });

  test("accepts valid non-overlapping custom slots", () => {
    const layout = computeLayout({
      kind: "custom",
      containerWidth: 1000,
      containerHeight: 1000,
      matches: matchesOf(2),
      customSlots: [
        { matchId: "m1", rect: { x: 0, y: 0, width: 500, height: 1000 }, isPrimary: true },
        { matchId: "m2", rect: { x: 500, y: 0, width: 500, height: 1000 }, isPrimary: false },
      ],
    });
    expect(layout.slots).toHaveLength(2);
  });
});

describe("recommendedLayoutForCount", () => {
  test.each([
    [1, "single"],
    [2, "two-horizontal"],
    [3, "three-primary"],
    [4, "four-grid"],
    [5, "five-primary"],
  ])("count %i -> %s", (count, expected) => {
    expect(recommendedLayoutForCount(count)).toBe(expected);
  });

  test("throws for unsupported counts", () => {
    expect(() => recommendedLayoutForCount(6)).toThrow();
    expect(() => recommendedLayoutForCount(0)).toThrow();
  });
});

describe("computeOverlayLayout", () => {
  test("expands target match to fill entire container", () => {
    const base = computeLayout({
      kind: "four-grid",
      containerWidth: 1920,
      containerHeight: 1080,
      matches: matchesOf(4),
    });
    const overlay = computeOverlayLayout(base, "m3");
    expect(overlay.slots).toHaveLength(1);
    expect(overlay.slots[0]!.rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  test("throws if match is not part of the base layout", () => {
    const base = computeLayout({
      kind: "two-horizontal",
      containerWidth: 1920,
      containerHeight: 1080,
      matches: matchesOf(2),
    });
    expect(() => computeOverlayLayout(base, "nonexistent")).toThrow();
  });
});

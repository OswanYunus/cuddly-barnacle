import type {
  ComputedLayout,
  LayoutKind,
  LayoutSlot,
  LayoutWarning,
  MatchSource,
  Rect,
} from "@shared/types";

/**
 * LayoutEngine
 * ------------
 * Pure, framework-free, resolution-independent layout math.
 * Every function here takes explicit container dimensions and returns
 * rects relative to (0,0)-(width,height) of the viewing area. No module
 * in this file reads window.innerWidth, screen APIs, or any global state.
 *
 * Units are "logical pixels" i.e. the caller is responsible for already
 * having divided out OS DPI scale factor before calling in, and for
 * re-multiplying when actually sizing native BrowserViews.
 */

/** Below this width or height (logical px) a match view is considered unusably small. */
const CRITICAL_MIN_DIMENSION = 240;
/** Below this, we still allow it but warn. */
const COMFORTABLE_MIN_DIMENSION = 360;

/** Minimum gap between viewing areas, in logical pixels. */
export const GUTTER = 4;

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function evaluateWarnings(slots: LayoutSlot[]): {
  warnings: LayoutWarning[];
  minW: number;
  minH: number;
} {
  const warnings: LayoutWarning[] = [];
  let minW = Infinity;
  let minH = Infinity;

  for (const slot of slots) {
    minW = Math.min(minW, slot.rect.width);
    minH = Math.min(minH, slot.rect.height);
  }

  if (!isFinite(minW)) {
    minW = 0;
    minH = 0;
  }

  if (minW < CRITICAL_MIN_DIMENSION || minH < CRITICAL_MIN_DIMENSION) {
    warnings.push({
      severity: "critical",
      message: `Viewing areas are only ${Math.round(minW)}×${Math.round(
        minH,
      )}px. This is too small to watch comfortably. Reduce the number of matches or choose a larger display.`,
    });
  } else if (minW < COMFORTABLE_MIN_DIMENSION || minH < COMFORTABLE_MIN_DIMENSION) {
    warnings.push({
      severity: "warning",
      message: `Viewing areas are ${Math.round(minW)}×${Math.round(
        minH,
      )}px, which is smaller than the recommended minimum of ${COMFORTABLE_MIN_DIMENSION}px. Detail (ball, scoreline text) may be hard to see.`,
    });
  }

  return { warnings, minW, minH };
}

/** Subtract gutters from a container split into `count` equal segments along one axis. */
function splitAxis(total: number, count: number, gutter: number): number[] {
  const usable = total - gutter * (count - 1);
  const each = usable / count;
  return Array.from({ length: count }, () => each);
}

export interface LayoutOptions {
  kind: LayoutKind;
  containerWidth: number;
  containerHeight: number;
  /** Ordered by priority ascending (1 = highest). Required length depends on `kind`. */
  matches: Pick<MatchSource, "id" | "priority">[];
  /** Only used for "two-custom" / "four-custom" / "five-custom" / "custom" */
  customSplitRatio?: number; // 0..1, portion given to first/primary element(s)
  /** User-authored custom rects, required when kind === 'custom' */
  customSlots?: LayoutSlot[];
}

export function computeLayout(options: LayoutOptions): ComputedLayout {
  const { kind, containerWidth, containerHeight } = options;

  if (containerWidth <= 0 || containerHeight <= 0) {
    throw new Error(
      `computeLayout: invalid container dimensions ${containerWidth}x${containerHeight}`,
    );
  }

  let slots: LayoutSlot[];

  switch (kind) {
    case "single":
      slots = layoutSingle(options);
      break;
    case "two-horizontal":
      slots = layoutTwoSplit(options, "horizontal", 0.5);
      break;
    case "two-vertical":
      slots = layoutTwoSplit(options, "vertical", 0.5);
      break;
    case "two-custom":
      slots = layoutTwoSplit(options, "horizontal", options.customSplitRatio ?? 0.5);
      break;
    case "three-primary":
      slots = layoutThreePrimary(options);
      break;
    case "three-equal":
      slots = layoutThreeEqual(options);
      break;
    case "four-grid":
      slots = layoutFourGrid(options);
      break;
    case "four-custom":
      slots = layoutFourGrid(options); // custom sizing handled via customSlots override below
      break;
    case "five-primary":
      slots = layoutFivePrimary(options);
      break;
    case "five-custom":
      slots = layoutFivePrimary(options);
      break;
    case "custom":
      if (!options.customSlots || options.customSlots.length === 0) {
        throw new Error("computeLayout: 'custom' kind requires customSlots");
      }
      slots = validateCustomSlots(options.customSlots, containerWidth, containerHeight);
      break;
    default: {
      const exhaustive: never = kind;
      throw new Error(`computeLayout: unhandled layout kind ${exhaustive as string}`);
    }
  }

  const { warnings, minW, minH } = evaluateWarnings(slots);

  return {
    kind,
    containerWidth,
    containerHeight,
    slots,
    minSlotWidth: minW,
    minSlotHeight: minH,
    warnings,
  };
}

function requireCount(matches: Pick<MatchSource, "id" | "priority">[], n: number, kind: string) {
  if (matches.length !== n) {
    throw new Error(`Layout '${kind}' requires exactly ${n} matches, got ${matches.length}`);
  }
}

function sortedByPriority(
  matches: Pick<MatchSource, "id" | "priority">[],
): Pick<MatchSource, "id" | "priority">[] {
  return [...matches].sort((a, b) => a.priority - b.priority);
}

function layoutSingle(o: LayoutOptions): LayoutSlot[] {
  requireCount(o.matches, 1, "single");
  const m = o.matches[0]!;
  return [
    {
      matchId: m.id,
      rect: rect(0, 0, o.containerWidth, o.containerHeight),
      isPrimary: true,
    },
  ];
}

function layoutTwoSplit(
  o: LayoutOptions,
  orientation: "horizontal" | "vertical",
  primaryRatio: number,
): LayoutSlot[] {
  requireCount(o.matches, 2, "two-split");
  const ordered = sortedByPriority(o.matches);
  const ratio = clamp(primaryRatio, 0.2, 0.8);

  if (orientation === "horizontal") {
    const w1 = o.containerWidth * ratio - GUTTER / 2;
    const w2 = o.containerWidth * (1 - ratio) - GUTTER / 2;
    return [
      { matchId: ordered[0]!.id, rect: rect(0, 0, w1, o.containerHeight), isPrimary: true },
      {
        matchId: ordered[1]!.id,
        rect: rect(w1 + GUTTER, 0, w2, o.containerHeight),
        isPrimary: false,
      },
    ];
  }
  const h1 = o.containerHeight * ratio - GUTTER / 2;
  const h2 = o.containerHeight * (1 - ratio) - GUTTER / 2;
  return [
    { matchId: ordered[0]!.id, rect: rect(0, 0, o.containerWidth, h1), isPrimary: true },
    {
      matchId: ordered[1]!.id,
      rect: rect(0, h1 + GUTTER, o.containerWidth, h2),
      isPrimary: false,
    },
  ];
}

function layoutThreePrimary(o: LayoutOptions): LayoutSlot[] {
  requireCount(o.matches, 3, "three-primary");
  const [primary, b, c] = sortedByPriority(o.matches) as [
    Pick<MatchSource, "id" | "priority">,
    Pick<MatchSource, "id" | "priority">,
    Pick<MatchSource, "id" | "priority">,
  ];

  const primaryWidth = o.containerWidth * 0.6 - GUTTER / 2;
  const sideWidth = o.containerWidth * 0.4 - GUTTER / 2;
  const sideHeight = (o.containerHeight - GUTTER) / 2;

  return [
    { matchId: primary.id, rect: rect(0, 0, primaryWidth, o.containerHeight), isPrimary: true },
    {
      matchId: b.id,
      rect: rect(primaryWidth + GUTTER, 0, sideWidth, sideHeight),
      isPrimary: false,
    },
    {
      matchId: c.id,
      rect: rect(primaryWidth + GUTTER, sideHeight + GUTTER, sideWidth, sideHeight),
      isPrimary: false,
    },
  ];
}

function layoutThreeEqual(o: LayoutOptions): LayoutSlot[] {
  requireCount(o.matches, 3, "three-equal");
  const ordered = sortedByPriority(o.matches);
  const widths = splitAxis(o.containerWidth, 3, GUTTER);
  let x = 0;
  const slots: LayoutSlot[] = [];
  widths.forEach((w, i) => {
    slots.push({
      matchId: ordered[i]!.id,
      rect: rect(x, 0, w, o.containerHeight),
      isPrimary: i === 0,
    });
    x += w + GUTTER;
  });
  return slots;
}

function layoutFourGrid(o: LayoutOptions): LayoutSlot[] {
  requireCount(o.matches, 4, "four-grid");
  const ordered = sortedByPriority(o.matches);
  const colWidths = splitAxis(o.containerWidth, 2, GUTTER);
  const rowHeights = splitAxis(o.containerHeight, 2, GUTTER);
  const w = colWidths[0]!;
  const h = rowHeights[0]!;
  const positions: Array<[number, number]> = [
    [0, 0],
    [w + GUTTER, 0],
    [0, h + GUTTER],
    [w + GUTTER, h + GUTTER],
  ];
  return ordered.map((m, i) => ({
    matchId: m.id,
    rect: rect(positions[i]![0], positions[i]![1], w, h),
    isPrimary: i === 0,
  }));
}

function layoutFivePrimary(o: LayoutOptions): LayoutSlot[] {
  requireCount(o.matches, 5, "five-primary");
  const ordered = sortedByPriority(o.matches);
  const primary = ordered[0]!;
  const rest = ordered.slice(1);

  const primaryWidth = o.containerWidth * 0.55 - GUTTER / 2;
  const sideWidth = o.containerWidth * 0.45 - GUTTER / 2;
  const rowHeights = splitAxis(o.containerHeight, 4, GUTTER);

  const slots: LayoutSlot[] = [
    {
      matchId: primary.id,
      rect: rect(0, 0, primaryWidth, o.containerHeight),
      isPrimary: true,
    },
  ];

  let y = 0;
  for (let i = 0; i < 4; i++) {
    const h = rowHeights[i]!;
    const m = rest[i];
    if (m) {
      slots.push({
        matchId: m.id,
        rect: rect(primaryWidth + GUTTER, y, sideWidth, h),
        isPrimary: false,
      });
    }
    y += h + GUTTER;
  }
  return slots;
}

function validateCustomSlots(
  slots: LayoutSlot[],
  containerWidth: number,
  containerHeight: number,
): LayoutSlot[] {
  for (const slot of slots) {
    const { x, y, width, height } = slot.rect;
    if (width <= 0 || height <= 0) {
      throw new Error(`Custom layout slot for match ${slot.matchId} has non-positive size`);
    }
    if (x < 0 || y < 0 || x + width > containerWidth + 0.5 || y + height > containerHeight + 0.5) {
      throw new Error(
        `Custom layout slot for match ${slot.matchId} is out of bounds (${x},${y},${width},${height}) in container ${containerWidth}x${containerHeight}`,
      );
    }
  }
  // Overlap check (axis-aligned bounding box intersection)
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (rectsOverlap(slots[i]!.rect, slots[j]!.rect)) {
        throw new Error(
          `Custom layout slots for ${slots[i]!.matchId} and ${slots[j]!.matchId} overlap`,
        );
      }
    }
  }
  return slots;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const EPS = 0.01; // tolerate floating point edge-touching, which is not a real overlap
  return !(
    a.x + a.width <= b.x + EPS ||
    b.x + b.width <= a.x + EPS ||
    a.y + a.height <= b.y + EPS ||
    b.y + b.height <= a.y + EPS
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Recommend a layout kind for a given match count, used by the session config screen. */
export function recommendedLayoutForCount(count: number): LayoutKind {
  switch (count) {
    case 1:
      return "single";
    case 2:
      return "two-horizontal";
    case 3:
      return "three-primary";
    case 4:
      return "four-grid";
    case 5:
      return "five-primary";
    default:
      throw new Error(`No recommended layout for ${count} matches (supported: 1-5)`);
  }
}

/**
 * Given a layout, compute a temporary "overlay" layout where one match is
 * expanded to fill the whole viewing area, remembering nothing — callers
 * must keep the original ComputedLayout to restore it afterwards.
 */
export function computeOverlayLayout(
  base: ComputedLayout,
  overlayMatchId: string,
): ComputedLayout {
  const target = base.slots.find((s) => s.matchId === overlayMatchId);
  if (!target) {
    throw new Error(`computeOverlayLayout: match ${overlayMatchId} not present in base layout`);
  }
  const slots: LayoutSlot[] = [
    {
      matchId: overlayMatchId,
      rect: rect(0, 0, base.containerWidth, base.containerHeight),
      isPrimary: true,
    },
  ];
  return {
    kind: base.kind,
    containerWidth: base.containerWidth,
    containerHeight: base.containerHeight,
    slots,
    minSlotWidth: base.containerWidth,
    minSlotHeight: base.containerHeight,
    warnings: [],
  };
}

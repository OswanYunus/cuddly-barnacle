import { create } from "zustand";
import type {
  ComputedLayout,
  EventSettings,
  LayoutKind,
  MatchSource,
  MonitorInfo,
  ScheduledOverlay,
} from "@shared/types";
import { DEFAULT_EVENT_SETTINGS } from "@shared/types";
import { computeLayout, recommendedLayoutForCount } from "../layout/LayoutEngine";

export type Screen = "dashboard" | "session-config" | "live" | "events" | "settings";

interface AppState {
  screen: Screen;
  monitors: MonitorInfo[];
  selectedMonitorId: number | null;
  matches: MatchSource[];
  layoutKind: LayoutKind;
  computedLayout: ComputedLayout | null;
  baseLayoutBeforeOverlay: ComputedLayout | null;
  activeOverlay: ScheduledOverlay | null;
  overlayQueue: ScheduledOverlay[];
  eventSettings: EventSettings;
  controlPanelVisible: boolean;

  setScreen: (screen: Screen) => void;
  setMonitors: (monitors: MonitorInfo[]) => void;
  selectMonitor: (id: number) => void;
  addMatch: (match: MatchSource) => void;
  removeMatch: (id: string) => void;
  updateMatch: (id: string, patch: Partial<MatchSource>) => void;
  reorderMatches: (orderedIds: string[]) => void;
  setLayoutKind: (kind: LayoutKind) => void;
  recomputeLayout: (containerWidth: number, containerHeight: number) => void;
  setActiveOverlay: (overlay: ScheduledOverlay | null) => void;
  setOverlayQueue: (queue: ScheduledOverlay[]) => void;
  updateEventSettings: (patch: Partial<EventSettings>) => void;
  toggleControlPanel: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: "dashboard",
  monitors: [],
  selectedMonitorId: null,
  matches: [],
  layoutKind: "single",
  computedLayout: null,
  baseLayoutBeforeOverlay: null,
  activeOverlay: null,
  overlayQueue: [],
  eventSettings: DEFAULT_EVENT_SETTINGS,
  controlPanelVisible: true,

  setScreen: (screen) => set({ screen }),
  setMonitors: (monitors) => set({ monitors }),
  selectMonitor: (id) => set({ selectedMonitorId: id }),

  addMatch: (match) =>
    set((state) => {
      const matches = [...state.matches, match];
      const layoutKind =
        matches.length <= 5 ? recommendedLayoutForCount(matches.length) : state.layoutKind;
      return { matches, layoutKind };
    }),

  removeMatch: (id) =>
    set((state) => {
      const matches = state.matches.filter((m) => m.id !== id);
      const layoutKind =
        matches.length > 0 && matches.length <= 5
          ? recommendedLayoutForCount(matches.length)
          : state.layoutKind;
      return { matches, layoutKind };
    }),

  updateMatch: (id, patch) =>
    set((state) => ({
      matches: state.matches.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m)),
    })),

  reorderMatches: (orderedIds) =>
    set((state) => {
      const byId = new Map(state.matches.map((m) => [m.id, m]));
      const matches = orderedIds.map((id) => byId.get(id)).filter((m): m is MatchSource => !!m);
      return { matches };
    }),

  setLayoutKind: (kind) => set({ layoutKind: kind }),

  recomputeLayout: (containerWidth, containerHeight) => {
    const { matches, layoutKind } = get();
    if (matches.length === 0) {
      set({ computedLayout: null });
      return;
    }
    try {
      const layout = computeLayout({
        kind: layoutKind,
        containerWidth,
        containerHeight,
        matches: matches.map((m) => ({ id: m.id, priority: m.priority })),
      });
      set({ computedLayout: layout });
    } catch (err) {
      // Keep the previous layout rather than crash the live view if the
      // current match count doesn't match the selected layout kind yet
      // (e.g. mid-edit while adding a match).
      console.error("Layout computation failed:", err);
    }
  },

  setActiveOverlay: (overlay) =>
    set((state) => {
      if (overlay) {
        return { activeOverlay: overlay, baseLayoutBeforeOverlay: state.computedLayout };
      }
      return { activeOverlay: null, computedLayout: state.baseLayoutBeforeOverlay ?? state.computedLayout };
    }),

  setOverlayQueue: (queue) => set({ overlayQueue: queue }),

  updateEventSettings: (patch) =>
    set((state) => ({ eventSettings: { ...state.eventSettings, ...patch } })),

  toggleControlPanel: () => set((state) => ({ controlPanelVisible: !state.controlPanelVisible })),
}));

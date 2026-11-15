import React from "react";
import { useAppStore } from "./store/useAppStore";
import { Dashboard } from "./screens/Dashboard";
import { SessionConfig } from "./screens/SessionConfig";
import { LiveViewing } from "./screens/LiveViewing";
import { EventManagement } from "./screens/EventManagement";
import { Settings } from "./screens/Settings";
import { Discovery } from "./screens/Discovery";
import "./styles/theme.css";

export function App(): React.ReactElement {
  const screen = useAppStore((s) => s.screen);

  switch (screen) {
    case "dashboard":
      return <Dashboard />;
    case "session-config":
      return <SessionConfig />;
    case "live":
      return <LiveViewing />;
    case "events":
      return <EventManagement />;
    case "settings":
      return <Settings />;
    case "discovery":
      return <Discovery />;
    default: {
      const exhaustive: never = screen;
      throw new Error(`Unhandled screen: ${exhaustive as string}`);
    }
  }
}

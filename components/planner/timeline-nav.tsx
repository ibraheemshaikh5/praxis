"use client";

import * as React from "react";

export type TimelineNavState = {
  direction: "up" | "down";
  jumpToToday: () => void;
  visible: boolean;
};

type TimelineNavContextValue = TimelineNavState & {
  setNav: (next: TimelineNavState) => void;
};

const defaultState: TimelineNavState = {
  direction: "up",
  jumpToToday: () => {},
  visible: false,
};

const TimelineNavContext = React.createContext<TimelineNavContextValue | null>(
  null,
);

export function TimelineNavProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<TimelineNavState>(defaultState);

  const setNav = React.useCallback((next: TimelineNavState) => {
    setState(next);
  }, []);

  const value = React.useMemo(
    () => ({ ...state, setNav }),
    [setNav, state],
  );

  return (
    <TimelineNavContext.Provider value={value}>
      {children}
    </TimelineNavContext.Provider>
  );
}

export function useTimelineNav() {
  const context = React.useContext(TimelineNavContext);
  if (!context) {
    throw new Error("useTimelineNav must be used within TimelineNavProvider");
  }
  return context;
}

export function usePublishTimelineNav() {
  const context = React.useContext(TimelineNavContext);
  if (!context) {
    throw new Error(
      "usePublishTimelineNav must be used within TimelineNavProvider",
    );
  }
  return context.setNav;
}

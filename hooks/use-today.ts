"use client";

import * as React from "react";

import { todayCalendarDate } from "@/lib/rolodex/dates";

/** The day never changes under a mounted page; nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * The server's calendar day is not the reader's, so "Yesterday" can only be
 * decided in the browser. Until it is — through the server render and the
 * hydration that matches it — this is null and callers show the date itself,
 * which is true on both sides.
 */
export function useToday() {
  return React.useSyncExternalStore(
    subscribe,
    () => todayCalendarDate(),
    () => null,
  );
}

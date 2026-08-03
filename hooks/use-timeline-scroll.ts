"use client";

import * as React from "react";

import type { PlannerDateKey } from "@/lib/planner/dates";

function sectionScrollTop(container: HTMLElement, section: HTMLElement) {
  return (
    container.scrollTop +
    (section.getBoundingClientRect().top - container.getBoundingClientRect().top)
  );
}

/**
 * Keeps the timeline scrollport stable when pages are prepended, and
 * performs the one-time instant jump to today after the first page settles.
 */
export function useTimelineScroll({
  getTodayScrollTop,
  loadedToday,
  onExtendBottom,
  onExtendTop,
  onVisibleDate,
  pageIndices,
  todayKey,
}: {
  getTodayScrollTop?: (
    container: HTMLDivElement,
    today: HTMLElement,
  ) => number;
  loadedToday: boolean;
  onExtendBottom: () => boolean;
  onExtendTop: () => boolean;
  onVisibleDate?: (date: PlannerDateKey) => void;
  pageIndices: number[];
  todayKey: PlannerDateKey;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const todaySectionRef = React.useRef<HTMLElement | null>(null);
  const topSentinelRef = React.useRef<HTMLDivElement>(null);
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);

  const isAnchoredRef = React.useRef(false);
  const ignoreTopRef = React.useRef(false);

  // Anchor id + distance from the scrollport top, captured before a prepend.
  const restoreRef = React.useRef<{
    id: string;
    offsetInView: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const restore = restoreRef.current;
    const container = scrollRef.current;
    if (!restore || !container) return;

    // Suspend snapping so the browser does not re-snap over the restore write.
    container.dataset.snap = "off";

    const anchor = document.getElementById(restore.id);
    if (anchor) {
      const containerTop = container.getBoundingClientRect().top;
      const currentOffset = anchor.getBoundingClientRect().top - containerTop;
      container.scrollTop += currentOffset - restore.offsetInView;
    }

    restoreRef.current = null;
    // Ignore the top sentinel briefly so compensation does not cascade.
    ignoreTopRef.current = true;

    const frame = window.requestAnimationFrame(() => {
      delete container.dataset.snap;
    });
    const timer = window.setTimeout(() => {
      ignoreTopRef.current = false;
    }, 400);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      ignoreTopRef.current = false;
      delete container.dataset.snap;
    };
  }, [pageIndices]);

  React.useLayoutEffect(() => {
    if (isAnchoredRef.current) return;
    if (!loadedToday) return;

    const container = scrollRef.current;
    const todayEl = todaySectionRef.current;
    if (!container || !todayEl) return;

    container.scrollTop = getTodayScrollTop
      ? getTodayScrollTop(container, todayEl)
      : sectionScrollTop(container, todayEl);
    isAnchoredRef.current = true;
  }, [getTodayScrollTop, loadedToday]);

  const captureRestorePoint = React.useCallback(() => {
    const container = scrollRef.current;
    if (!container) return false;

    const containerTop = container.getBoundingClientRect().top;
    const days = container.querySelectorAll<HTMLElement>("[data-day]");
    let chosen: HTMLElement | null = null;

    for (const day of days) {
      if (day.getBoundingClientRect().bottom > containerTop + 1) {
        chosen = day;
        break;
      }
    }

    if (!chosen) chosen = days[0] ?? null;
    if (!chosen?.id) return false;

    restoreRef.current = {
      id: chosen.id,
      offsetInView: chosen.getBoundingClientRect().top - containerTop,
    };
    return true;
  }, []);

  React.useEffect(() => {
    const container = scrollRef.current;
    const topSentinel = topSentinelRef.current;
    const bottomSentinel = bottomSentinelRef.current;
    if (!container || !topSentinel || !bottomSentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!isAnchoredRef.current) return;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          if (entry.target === topSentinel) {
            if (ignoreTopRef.current || restoreRef.current) continue;
            if (!captureRestorePoint()) continue;
            const extended = onExtendTop();
            if (!extended) restoreRef.current = null;
          }

          if (entry.target === bottomSentinel) {
            onExtendBottom();
          }
        }
      },
      {
        root: container,
        rootMargin: "240px 0px",
      },
    );

    observer.observe(topSentinel);
    observer.observe(bottomSentinel);
    return () => observer.disconnect();
  }, [captureRestorePoint, onExtendBottom, onExtendTop]);

  const [jumpVisible, setJumpVisible] = React.useState(false);
  const [jumpDirection, setJumpDirection] = React.useState<"up" | "down">(
    "up",
  );

  React.useEffect(() => {
    const container = scrollRef.current;
    const todayEl = todaySectionRef.current;
    if (!container || !todayEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || !isAnchoredRef.current) return;

        const visible = entry.isIntersecting;
        setJumpVisible(!visible);

        if (!visible) {
          const containerRect = container.getBoundingClientRect();
          const todayRect = todayEl.getBoundingClientRect();
          setJumpDirection(
            todayRect.top < containerRect.top ? "up" : "down",
          );
        }
      },
      {
        root: container,
        threshold: 0,
      },
    );

    observer.observe(todayEl);
    return () => observer.disconnect();
  }, [todayKey, loadedToday]);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container || !onVisibleDate) return;
    let frame = 0;

    const publishVisibleDate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!isAnchoredRef.current) return;
        const containerTop = container.getBoundingClientRect().top;
        const probe = containerTop + Math.min(96, container.clientHeight / 4);
        const days = container.querySelectorAll<HTMLElement>("[data-day]");
        let visible: HTMLElement | null = null;

        for (const day of days) {
          const rect = day.getBoundingClientRect();
          if (rect.top <= probe && rect.bottom > probe) {
            visible = day;
            break;
          }
          if (!visible && rect.bottom > probe) visible = day;
        }

        const date = visible?.dataset.day;
        if (date) onVisibleDate(date);
      });
    };

    publishVisibleDate();
    container.addEventListener("scroll", publishVisibleDate, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("scroll", publishVisibleDate);
    };
  }, [onVisibleDate, pageIndices]);

  const jumpToToday = React.useCallback(() => {
    const container = scrollRef.current;
    const todayEl = todaySectionRef.current;
    if (!container || !todayEl) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const top = getTodayScrollTop
      ? getTodayScrollTop(container, todayEl)
      : sectionScrollTop(container, todayEl);

    if (reduceMotion) {
      container.scrollTop = top;
      return;
    }

    container.scrollTo({
      top,
      behavior: "smooth",
    });
  }, [getTodayScrollTop]);

  return {
    bottomSentinelRef,
    jumpDirection,
    jumpToToday,
    jumpVisible,
    scrollRef,
    todaySectionRef,
    topSentinelRef,
  };
}

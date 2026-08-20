"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The publication's favicon, looked up from the article's own host, so a shelf
 * of articles is scannable by masthead rather than by title alone.
 */
export function SiteIcon({
  className,
  url,
}: {
  className?: string;
  url: string | null;
}) {
  const [failed, setFailed] = React.useState(false);

  const host = React.useMemo(() => {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }, [url]);

  if (!host || failed) return null;

  return (
    /* A favicon endpoint keyed by host; nothing for next/image to optimize. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden
      className={cn("size-3.5 shrink-0 rounded-[3px]", className)}
      height={14}
      loading="lazy"
      onError={() => setFailed(true)}
      src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`}
      width={14}
    />
  );
}

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Covers come from third-party hosts on URLs the app does not control, so a
 * missing or dead image is ordinary rather than exceptional. The fallback is a
 * typeset panel that still reads as the book, which is why it carries the title
 * instead of an icon.
 */

const PANELS = [
  "from-chart-1/30 via-chart-1/10 to-chart-4/25",
  "from-chart-2/30 via-chart-2/10 to-chart-5/25",
  "from-chart-3/30 via-chart-3/10 to-chart-1/25",
  "from-chart-4/30 via-chart-4/10 to-chart-2/25",
  "from-chart-5/30 via-chart-5/10 to-chart-3/25",
];

function panelFor(seed: string) {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  }
  return PANELS[hash % PANELS.length];
}

export function CoverArt({
  author,
  className,
  imageUrl,
  kind,
  title,
}: {
  author?: string | null;
  className?: string;
  imageUrl: string | null;
  kind: "book" | "article" | "video";
  title: string;
}) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const broken = imageUrl !== null && failed === imageUrl;

  if (imageUrl && !broken) {
    return (
      /* Arbitrary publisher and catalogue hosts: next/image would need every
         one of them declared as a remote pattern. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        aria-hidden
        className={cn("size-full", className)}
        key={imageUrl}
        loading="lazy"
        onError={() => setFailed(imageUrl)}
        referrerPolicy="no-referrer"
        src={imageUrl}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex size-full flex-col justify-between bg-gradient-to-br p-4",
        panelFor(title),
        className,
      )}
    >
      <p
        className={cn(
          "font-serif leading-tight text-foreground/80",
          kind === "book"
            ? "line-clamp-5 text-base"
            : "line-clamp-3 text-sm text-foreground/70",
        )}
      >
        {title}
      </p>
      {author ? (
        <p className="line-clamp-1 text-[11px] tracking-wide text-foreground/50 uppercase">
          {author}
        </p>
      ) : null}
    </div>
  );
}

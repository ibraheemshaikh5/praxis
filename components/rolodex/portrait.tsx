"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Profile photos are hosted by whichever service supplied them and expire
 * without notice, so a dead image is ordinary rather than exceptional. The
 * fallback is initials on a colour derived from the name, which keeps a face
 * recognisable by position and hue in a grid.
 */

const PANELS = [
  "bg-chart-1/25 text-chart-1",
  "bg-chart-2/25 text-chart-2",
  "bg-chart-3/25 text-chart-3",
  "bg-chart-4/25 text-chart-4",
  "bg-chart-5/25 text-chart-5",
];

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function panelFor(seed: string) {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  }
  return PANELS[hash % PANELS.length];
}

export function Portrait({
  avatarUrl,
  className,
  name,
}: {
  avatarUrl: string | null;
  className?: string;
  name: string;
}) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const broken = avatarUrl !== null && failed === avatarUrl;

  if (avatarUrl && !broken) {
    return (
      /* Arbitrary provider and CDN hosts: next/image would need every one of
         them declared as a remote pattern. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        aria-hidden
        className={cn("size-full object-cover", className)}
        key={avatarUrl}
        loading="lazy"
        onError={() => setFailed(avatarUrl)}
        referrerPolicy="no-referrer"
        src={avatarUrl}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-full place-items-center font-medium tracking-wide",
        panelFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

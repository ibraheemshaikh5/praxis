"use client";

import * as React from "react";
import { Check, Images } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The stored covers are printings of the same book, and some of them are
 * edition-level images that may not exist. One that fails to load is dropped
 * from the grid rather than shown as a hole.
 */
export function CoverPicker({
  className,
  covers,
  onSelect,
  selected,
  title,
}: {
  className?: string;
  covers: string[];
  onSelect: (cover: string) => void;
  selected: string | null;
  title: string;
}) {
  const [broken, setBroken] = React.useState<string[]>([]);
  const usable = covers.filter((cover) => !broken.includes(cover));

  if (covers.length < 2) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Change the cover for ${title}`}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-4xl bg-background/85 text-muted-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none",
          className,
        )}
      >
        <Images className="size-3.5" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 gap-3 p-3" side="bottom">
        <div className="grid grid-cols-4 gap-2">
          {usable.map((cover) => (
            <button
              aria-label="Use this cover"
              aria-pressed={cover === selected}
              className={cn(
                "relative aspect-[2/3] overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 transition hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                cover === selected && "ring-2 ring-primary",
              )}
              key={cover}
              onClick={() => onSelect(cover)}
              type="button"
            >
              {/* Catalogue host, keyed by edition; nothing to optimize. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                aria-hidden
                className="size-full object-cover"
                loading="lazy"
                onError={() =>
                  setBroken((current) =>
                    current.includes(cover) ? current : [...current, cover],
                  )
                }
                referrerPolicy="no-referrer"
                src={cover}
              />
              {cover === selected ? (
                <span className="absolute inset-0 grid place-items-center bg-primary/20">
                  <Check className="size-4 text-primary-foreground drop-shadow" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

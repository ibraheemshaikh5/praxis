"use client";

import * as React from "react";
import Link from "next/link";

import { CoverArt } from "@/components/knowledge/cover-art";
import { CoverPicker } from "@/components/knowledge/cover-picker";
import {
  RemoveItemButton,
  RemoveKnowledgeItemDialog,
} from "@/components/knowledge/remove-knowledge-item";
import { SiteIcon } from "@/components/knowledge/site-icon";
import type { KnowledgeItemPayload } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background";

/**
 * The controls sit over the cover rather than under the title, so they stay out
 * of the way until the card is reached for. Each one carries its own visibility
 * so an open cover popover keeps its trigger on screen.
 */
const OVERLAY_CONTROL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none";

export function BookCard({
  item,
  onSelectCover,
}: {
  item: KnowledgeItemPayload;
  onSelectCover: (cover: string) => void;
}) {
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);

  return (
    <article className="group relative">
      <Link className={cn("block", FOCUS_RING)} href={`/knowledge/${item.id}`}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-sm ring-1 ring-foreground/10 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-xl motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
          <CoverArt
            author={item.author}
            className="object-cover"
            imageUrl={item.imageUrl}
            kind="book"
            title={item.title}
          />
          {/* The spine edge: what makes a flat image read as a book. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/25 via-black/5 to-transparent"
          />
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-snug font-medium">
          {item.title}
        </p>
        {item.author ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {item.author}
          </p>
        ) : null}
      </Link>

      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        <CoverPicker
          className={cn(OVERLAY_CONTROL, "data-popup-open:opacity-100")}
          covers={item.coverOptions}
          onSelect={onSelectCover}
          selected={item.imageUrl}
          title={item.title}
        />
        <RemoveItemButton
          className={OVERLAY_CONTROL}
          onClick={() => setConfirmingRemoval(true)}
          title={item.title}
        />
      </div>

      <RemoveKnowledgeItemDialog
        item={item}
        onOpenChange={setConfirmingRemoval}
        open={confirmingRemoval}
      />
    </article>
  );
}

export function ArticleCard({ item }: { item: KnowledgeItemPayload }) {
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);

  return (
    <article className="group relative">
      <Link
        className={cn(
          "flex h-full flex-col overflow-hidden border border-border bg-card transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
          FOCUS_RING,
        )}
        href={`/knowledge/${item.id}`}
      >
        <div className="aspect-[16/10] overflow-hidden bg-muted">
          <CoverArt
            className="object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            imageUrl={item.imageUrl}
            kind="article"
            title={item.title}
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {item.source ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SiteIcon url={item.url} />
              <span className="line-clamp-1">{item.source}</span>
            </p>
          ) : null}
          <p className="line-clamp-3 text-sm leading-snug font-medium">
            {item.title}
          </p>
          {item.author ? (
            <p className="mt-auto line-clamp-1 pt-1 text-xs text-muted-foreground">
              {item.author}
            </p>
          ) : null}
        </div>
      </Link>

      <RemoveItemButton
        className={cn(OVERLAY_CONTROL, "absolute top-2 right-2")}
        onClick={() => setConfirmingRemoval(true)}
        title={item.title}
      />

      <RemoveKnowledgeItemDialog
        item={item}
        onOpenChange={setConfirmingRemoval}
        open={confirmingRemoval}
      />
    </article>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";

import { CoverArt } from "@/components/reading/cover-art";
import { CoverPicker } from "@/components/reading/cover-picker";
import { RemoveReadingItemDialog } from "@/components/reading/remove-reading-item";
import { SiteIcon } from "@/components/reading/site-icon";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReadingItem, useUpdateReadingItem } from "@/hooks/use-reading";
import { signOut } from "@/lib/auth/actions";
import type { ReadingItemPayload } from "@/lib/api/types";
import { isHttpUrl } from "@/lib/reading/entry";
import { cn } from "@/lib/utils";

export function ReadingDetail({
  initialItem,
  userEmail,
}: {
  initialItem: ReadingItemPayload;
  userEmail: string | null;
}) {
  const router = useRouter();
  const { data } = useReadingItem(initialItem.id, initialItem);
  const item = data.item;

  const updateItem = useUpdateReadingItem();
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);

  const isBook = item.kind === "book";

  return (
    <AppShell
      onSignOut={() => void signOut()}
      title="Reading"
      userEmail={userEmail}
    >
      <div className="py-8 lg:py-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1 rounded-4xl text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            href="/reading"
          >
            <ChevronLeft className="size-4" />
            Reading
          </Link>

          <Button
            onClick={() => setConfirmingRemoval(true)}
            size="sm"
            variant="ghost"
          >
            Remove
          </Button>
        </div>

        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10">
          <div className="relative shrink-0 self-start">
            <div
              className={cn(
                "relative overflow-hidden bg-muted shadow-lg ring-1 ring-foreground/10",
                isBook
                  ? "aspect-[2/3] w-40 rounded-xl sm:w-48"
                  : "aspect-[16/10] w-full rounded-2xl sm:w-80",
              )}
            >
              <CoverArt
                author={item.author}
                className="object-cover"
                imageUrl={item.imageUrl}
                kind={item.kind}
                title={item.title}
              />
              {isBook ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-3 rounded-l-xl bg-gradient-to-r from-black/25 via-black/5 to-transparent"
                />
              ) : null}
            </div>

            <CoverPicker
              className="absolute top-2 right-2"
              covers={item.coverOptions}
              onSelect={(cover) => {
                if (cover === item.imageUrl) return;
                updateItem.mutate({
                  itemId: item.id,
                  body: { imageUrl: cover, expectedVersion: item.version },
                });
              }}
              selected={item.imageUrl}
              title={item.title}
            />
          </div>

          <div className="min-w-0 flex-1">
            {item.source ? (
              <p className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <SiteIcon url={item.url} />
                {item.source}
              </p>
            ) : null}

            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {item.title}
            </h1>

            {item.author ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {item.author}
              </p>
            ) : null}

            <div className="mt-8">
              {isBook ? (
                <BookLink
                  item={item}
                  onSave={(pdfUrl) =>
                    updateItem.mutate({
                      itemId: item.id,
                      body: { pdfUrl, expectedVersion: item.version },
                    })
                  }
                  pending={updateItem.isPending}
                />
              ) : (
                <SourceLink href={item.url} label="Open article" />
              )}
            </div>
          </div>
        </div>
      </div>

      <RemoveReadingItemDialog
        item={item}
        onOpenChange={setConfirmingRemoval}
        onRemoved={() => router.push("/reading")}
        open={confirmingRemoval}
      />
    </AppShell>
  );
}

function BookLink({
  item,
  onSave,
  pending,
}: {
  item: ReadingItemPayload;
  onSave: (pdfUrl: string | null) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = React.useState(false);

  if (item.pdfUrl && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <SourceLink href={item.pdfUrl} label="Open PDF" />
        <Button
          aria-label="Change the PDF link"
          onClick={() => setEditing(true)}
          size="icon-sm"
          variant="ghost"
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <PdfLinkForm
      initialValue={item.pdfUrl ?? ""}
      onCancel={item.pdfUrl ? () => setEditing(false) : null}
      onSave={(value) => {
        onSave(value);
        setEditing(false);
      }}
      pending={pending}
    />
  );
}

function PdfLinkForm({
  initialValue,
  onCancel,
  onSave,
  pending,
}: {
  initialValue: string;
  onCancel: (() => void) | null;
  onSave: (pdfUrl: string | null) => void;
  pending: boolean;
}) {
  const [value, setValue] = React.useState(initialValue);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();

    if (trimmed && !isHttpUrl(trimmed)) {
      toast.error("Expected an http or https link.");
      return;
    }

    onSave(trimmed || null);
  }

  return (
    <form className="flex max-w-lg flex-wrap gap-2" onSubmit={submit}>
      <Input
        aria-label="PDF link"
        autoComplete="off"
        className="h-9 min-w-64 flex-1"
        name="pdfUrl"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Link to a PDF"
        spellCheck={false}
        value={value}
      />
      <Button disabled={pending} type="submit">
        Save
      </Button>
      {onCancel ? (
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
      ) : null}
    </form>
  );
}

function SourceLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;

  return (
    <div className="min-w-0">
      <a
        className="inline-flex h-9 items-center gap-1.5 rounded-4xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"
        href={href}
        rel="noreferrer noopener"
        target="_blank"
      >
        {label}
        <ExternalLink className="size-4" />
      </a>
      <p className="mt-2 max-w-lg truncate text-xs text-muted-foreground">
        {href}
      </p>
    </div>
  );
}

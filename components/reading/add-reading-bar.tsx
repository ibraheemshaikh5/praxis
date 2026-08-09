"use client";

import * as React from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddReadingBar({
  onChange,
  onSubmit,
  pending,
  value,
}: {
  onChange: (value: string) => void;
  onSubmit: (input: string) => void;
  pending: boolean;
  value: string;
}) {
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = value.trim();
    if (!input || pending) return;
    onSubmit(input);
  }

  return (
    <form className="relative" onSubmit={submit}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Article link or book title"
        autoComplete="off"
        className="h-12 rounded-4xl border-border bg-card pr-14 pl-11 text-base shadow-sm"
        name="entry"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste an article link or type a book title"
        spellCheck={false}
        value={value}
      />
      <Button
        aria-label="Save"
        className="absolute top-1/2 right-1.5 -translate-y-1/2"
        disabled={pending || value.trim() === ""}
        size="icon-sm"
        type="submit"
      >
        {pending ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowRight />
        )}
      </Button>
    </form>
  );
}

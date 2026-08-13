"use client";

import * as React from "react";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddConnectionBar({
  onSubmit,
  pending,
}: {
  onSubmit: (input: string, done: () => void) => void;
  pending: boolean;
}) {
  const [value, setValue] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = value.trim();
    if (!input || pending) return;
    onSubmit(input, () => setValue(""));
  }

  return (
    <form className="relative" onSubmit={submit}>
      <UserPlus
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="LinkedIn link or name"
        autoComplete="off"
        className="h-12 rounded-4xl border-border bg-card pr-14 pl-11 text-base shadow-sm"
        name="connection"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Paste a LinkedIn link or type a name"
        spellCheck={false}
        value={value}
      />
      <Button
        aria-label="Add"
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

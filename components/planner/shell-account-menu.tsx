"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

function accountInitial(email: string | null) {
  if (!email) return "?";
  const local = email.split("@")[0]?.trim();
  const letter = local?.[0];
  return letter ? letter.toUpperCase() : "?";
}

export function ShellAccountMenu({
  userEmail,
  onSignOut,
}: {
  userEmail: string | null;
  onSignOut: () => void;
}) {
  const label = userEmail ?? "Signed in";

  return (
    <Button
      aria-label={`Sign out (${label})`}
      className="rounded-4xl text-muted-foreground hover:text-foreground"
      onClick={onSignOut}
      size="icon-sm"
      title={`Sign out - ${label}`}
      variant="ghost"
    >
      <LogOut />
    </Button>
  );
}

export function ShellAccountPanel({
  userEmail,
  onSignOut,
  themeControl,
}: {
  userEmail: string | null;
  onSignOut: () => void;
  themeControl: ReactNode;
}) {
  const label = userEmail ?? "Signed in";

  return (
    <div className="rounded-2xl border border-sidebar-border bg-card/70 p-3">
      <div className="flex items-center gap-3 px-1">
        <div
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
        >
          {accountInitial(userEmail)}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p
            className="truncate text-sm font-medium text-foreground"
            title={label}
          >
            {label}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {themeControl}
        <Button
          className="h-8 flex-1 justify-start rounded-4xl text-muted-foreground hover:text-foreground"
          onClick={onSignOut}
          size="sm"
          variant="ghost"
        >
          <LogOut data-icon="inline-start" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

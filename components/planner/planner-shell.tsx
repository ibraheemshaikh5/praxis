"use client";

import * as React from "react";
import { Check } from "lucide-react";

import {
  ShellAccountMenu,
  ShellAccountPanel,
} from "@/components/planner/shell-account-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export function PlannerShell({
  children,
  headerAction,
  rail,
  userEmail,
  onSignOut,
}: {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  rail?: React.ReactNode;
  userEmail: string | null;
  onSignOut: () => void;
}) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 planner-grid opacity-50"
        />

        <div className="relative flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Check className="size-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
              Praxis
            </p>
            <p className="text-xs text-muted-foreground">Daily planner</p>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col px-5 pt-6 pb-5">
          <p className="max-w-[14rem] text-sm leading-6 text-muted-foreground">
            Tasks for each day, kept in one scrolling list.
          </p>

          <div className="mt-auto">
            <ShellAccountPanel
              onSignOut={onSignOut}
              themeControl={<ThemeToggle />}
              userEmail={userEmail}
            />
          </div>
        </div>
      </aside>

      <section className="relative min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <div className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Check className="size-4" strokeWidth={2.2} />
            </div>
            <span className="truncate text-[15px] font-semibold tracking-tight">
              Praxis
            </span>
          </div>

          <p className="hidden text-sm text-muted-foreground lg:block">
            Daily planner
          </p>

          <div className="flex items-center gap-1">
            {headerAction}
            <div className="flex items-center gap-1 lg:hidden">
              <ThemeToggle />
              <ShellAccountMenu onSignOut={onSignOut} userEmail={userEmail} />
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-14">
            <div className="min-w-0">{children}</div>
            {rail ? (
              <aside className="min-w-0 border-t border-border pt-8 pb-10 xl:border-t-0 xl:pt-0 xl:pb-0">
                <div className="xl:sticky xl:top-24 xl:py-8">{rail}</div>
              </aside>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

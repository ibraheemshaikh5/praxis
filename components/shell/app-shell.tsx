"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  Compass,
  Contact,
} from "lucide-react";

import {
  ShellAccountMenu,
  ShellAccountPanel,
} from "@/components/planner/shell-account-menu";
import { PageBuildNotes } from "@/components/shell/page-build-notes";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: CalendarDays, label: "Daily planner" },
  { href: "/applications", icon: Briefcase, label: "Applications" },
  { href: "/reading", icon: BookOpen, label: "Reading" },
  { href: "/rolodex", icon: Contact, label: "Rolodex" },
  { href: "/careers", icon: Compass, label: "Careers" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  headerAction,
  rail,
  title,
  userEmail,
  onSignOut,
}: {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  rail?: React.ReactNode;
  title: string;
  userEmail: string | null;
  onSignOut: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [signOutPending, startSignOutTransition] = React.useTransition();

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await onSignOut();
    });
  };

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
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
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col px-3 pt-4 pb-5">
          <nav aria-label="Sections">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                      href={item.href}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto px-2">
            <ShellAccountPanel
              onSignOut={handleSignOut}
              signOutPending={signOutPending}
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
            <nav
              aria-label="Sections"
              className="flex items-center gap-0.5 rounded-4xl bg-muted/70 p-0.5"
            >
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={cn(
                      "grid size-8 place-items-center rounded-4xl transition-colors motion-reduce:transition-none",
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    <item.icon className="size-4" />
                  </Link>
                );
              })}
            </nav>
          </div>

          <p className="hidden text-sm text-muted-foreground lg:block">
            {title}
          </p>

          <div className="flex items-center gap-1">
            <PageBuildNotes />
            {headerAction}
            <div className="flex items-center gap-1 lg:hidden">
              <ThemeToggle />
              <ShellAccountMenu
                onSignOut={handleSignOut}
                signOutPending={signOutPending}
                userEmail={userEmail}
              />
            </div>
          </div>
        </header>

        {/* Without a rail the content is the whole page, so it gets the wider
            measure instead of leaving a 300px column standing empty. */}
        <div
          className={cn(
            "mx-auto w-full px-4 sm:px-6 lg:px-10",
            rail ? "max-w-6xl" : "max-w-7xl",
          )}
        >
          <div
            className={cn(
              "grid gap-10",
              rail && "xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-14",
            )}
          >
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

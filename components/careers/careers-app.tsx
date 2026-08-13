"use client";

import { AppShell } from "@/components/shell/app-shell";
import { PageWhiteboard } from "@/components/whiteboard/page-whiteboard";
import { signOut } from "@/lib/auth/actions";

export function CareersApp({ userEmail }: { userEmail: string | null }) {
  return (
    <AppShell
      headerAction={<PageWhiteboard />}
      onSignOut={signOut}
      title="Careers"
      userEmail={userEmail}
    >
      <div className="py-8 lg:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Careers</h1>
      </div>
    </AppShell>
  );
}

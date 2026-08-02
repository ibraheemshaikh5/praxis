import { redirect } from "next/navigation";

import { ApplicationsApp } from "@/components/applications/applications-app";
import { DEFAULT_CYCLE } from "@/lib/applications/service";
import { getProfileTimeZone } from "@/lib/planner/profile";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const timeZone = await getProfileTimeZone(user.id);

  return (
    <ApplicationsApp
      defaultCycle={DEFAULT_CYCLE}
      timeZone={timeZone}
      userEmail={user.email ?? null}
    />
  );
}

import { redirect } from "next/navigation";

import { PlannerApp } from "@/components/planner/planner-app";
import { getProfileTimeZone } from "@/lib/planner/profile";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const timeZone = await getProfileTimeZone(user.id);

  return <PlannerApp timeZone={timeZone} userEmail={user.email ?? null} />;
}

import { redirect } from "next/navigation";

import { CareersApp } from "@/components/careers/careers-app";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <CareersApp userEmail={user.email ?? null} />;
}

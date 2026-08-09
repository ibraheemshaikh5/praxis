import { redirect } from "next/navigation";

import { RolodexApp } from "@/components/rolodex/rolodex-app";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <RolodexApp userEmail={user.email ?? null} />;
}

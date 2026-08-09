import { redirect } from "next/navigation";

import { ReadingApp } from "@/components/reading/reading-app";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <ReadingApp userEmail={user.email ?? null} />;
}

import { redirect } from "next/navigation";

import { KnowledgeApp } from "@/components/knowledge/knowledge-app";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <KnowledgeApp userEmail={user.email ?? null} />;
}

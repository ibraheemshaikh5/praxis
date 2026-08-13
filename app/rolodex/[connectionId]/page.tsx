import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ConnectionDetail } from "@/components/rolodex/connection-detail";
import { NotFoundError } from "@/lib/daily-planner/errors";
import { toConnectionDetailPayload } from "@/lib/rolodex/payload";
import { getRolodexService } from "@/lib/rolodex/runtime";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { connectionId } = await params;
  if (!z.string().uuid().safeParse(connectionId).success) notFound();

  const connection = await loadConnection(user.id, connectionId);
  if (!connection) notFound();

  return (
    <ConnectionDetail
      initialConnection={toConnectionDetailPayload(connection)}
      userEmail={user.email ?? null}
    />
  );
}

async function loadConnection(userId: string, connectionId: string) {
  try {
    return await getRolodexService().getConnection(userId, connectionId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

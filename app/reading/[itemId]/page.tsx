import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ReadingDetail } from "@/components/reading/reading-detail";
import { NotFoundError } from "@/lib/daily-planner/errors";
import { toReadingItemPayload } from "@/lib/reading/payload";
import { getReadingService } from "@/lib/reading/runtime";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Page({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { itemId } = await params;
  if (!z.string().uuid().safeParse(itemId).success) notFound();

  const item = await loadItem(user.id, itemId);
  if (!item) notFound();

  return (
    <ReadingDetail
      initialItem={toReadingItemPayload(item)}
      userEmail={user.email ?? null}
    />
  );
}

async function loadItem(userId: string, itemId: string) {
  try {
    return await getReadingService().getItem(userId, itemId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

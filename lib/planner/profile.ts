import "server-only";

import { eq } from "drizzle-orm";

import { getDatabaseClient } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

export const FALLBACK_TIME_ZONE = "America/New_York";

/**
 * The planner renders every calendar date in the owner's profile time zone so
 * that the client agrees with the time-block validation done on the server.
 */
export async function getProfileTimeZone(userId: string): Promise<string> {
  const { db } = getDatabaseClient();
  const profile = await db.query.profiles.findFirst({
    columns: { timeZone: true },
    where: eq(profiles.id, userId),
  });

  return profile?.timeZone ?? FALLBACK_TIME_ZONE;
}

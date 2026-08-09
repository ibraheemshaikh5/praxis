import type { ReadingItemPayload } from "@/lib/api/types";
import type { ReadingItem } from "@/lib/db/schema";

/**
 * Route handlers serialize timestamps on the way out; a server component hands
 * the row to the client directly, so it converts them here instead.
 */
export function toReadingItemPayload(item: ReadingItem): ReadingItemPayload {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

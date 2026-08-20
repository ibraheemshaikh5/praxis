import type { KnowledgeItemPayload } from "@/lib/api/types";
import type { KnowledgeItem } from "@/lib/db/schema";

/**
 * Route handlers serialize timestamps on the way out; a server component hands
 * the row to the client directly, so it converts them here instead.
 */
export function toKnowledgeItemPayload(
  item: KnowledgeItem,
): KnowledgeItemPayload {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

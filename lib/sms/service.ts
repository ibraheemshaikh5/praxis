import { and, desc, eq, gte, ne } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { smsMessages } from "@/lib/db/schema";

import type { HistoryTurn } from "./agent";
import { truncateSms } from "./text";

// Enough to resolve "that one" or "undo" a few texts later, without dragging a
// stale conversation from yesterday into today's requests.
const HISTORY_LIMIT = 12;
const HISTORY_WINDOW_MS = 12 * 60 * 60 * 1000;

export class SmsConversationService {
  constructor(private readonly db: Database) {}

  /**
   * Records an inbound text. Returns null when the provider SID was already
   * recorded, meaning this delivery is a retry that must not be acted on.
   */
  async recordInbound(userId: string, providerSid: string, body: string) {
    const [row] = await this.db
      .insert(smsMessages)
      .values({
        userId,
        direction: "inbound",
        providerSid,
        body: truncateSms(body),
      })
      .onConflictDoNothing({ target: smsMessages.providerSid })
      .returning();
    return row ?? null;
  }

  async recordOutbound(
    userId: string,
    providerSid: string | null,
    body: string,
    toolLog: string | null,
  ) {
    const [row] = await this.db
      .insert(smsMessages)
      .values({
        userId,
        direction: "outbound",
        providerSid,
        body: truncateSms(body),
        toolLog: toolLog?.slice(-8000) ?? null,
      })
      .returning();
    return row;
  }

  /** Recent turns before the given message, oldest first. */
  async recentHistory(
    userId: string,
    excludeId: string,
    now = new Date(),
  ): Promise<HistoryTurn[]> {
    const rows = await this.db
      .select({
        direction: smsMessages.direction,
        body: smsMessages.body,
        toolLog: smsMessages.toolLog,
      })
      .from(smsMessages)
      .where(
        and(
          eq(smsMessages.userId, userId),
          ne(smsMessages.id, excludeId),
          gte(
            smsMessages.createdAt,
            new Date(now.getTime() - HISTORY_WINDOW_MS),
          ),
        ),
      )
      .orderBy(desc(smsMessages.createdAt))
      .limit(HISTORY_LIMIT);

    return rows.reverse();
  }
}

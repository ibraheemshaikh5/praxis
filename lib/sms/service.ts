import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { smsMessages, smsPollLeases } from "@/lib/db/schema";

import { truncateSms, truncateToolLog } from "./limits";
import type { ConversationStore, HistoryTurn } from "./types";

// Enough to resolve "that one" or "undo" a few texts later, without dragging a
// stale conversation from yesterday into today's requests.
const HISTORY_LIMIT = 12;
const HISTORY_WINDOW_MS = 12 * 60 * 60 * 1000;

export class SmsConversationService implements ConversationStore {
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
        toolLog: toolLog === null ? null : truncateToolLog(toolLog),
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

  async acquirePollLease(userId: string, ttlMs: number) {
    const holder = randomUUID();
    // The database clock decides expiry, so every poll agrees on it.
    const heldUntil = sql`now() + ${`${ttlMs} milliseconds`}::interval`;
    const [lease] = await this.db
      .insert(smsPollLeases)
      .values({ userId, holder, heldUntil })
      .onConflictDoUpdate({
        target: smsPollLeases.userId,
        set: { holder, heldUntil },
        setWhere: lt(smsPollLeases.heldUntil, sql`now()`),
      })
      .returning({ holder: smsPollLeases.holder });
    return lease?.holder ?? null;
  }

  async releasePollLease(userId: string, token: string) {
    await this.db
      .update(smsPollLeases)
      .set({ heldUntil: sql`now()` })
      .where(
        and(eq(smsPollLeases.userId, userId), eq(smsPollLeases.holder, token)),
      );
  }
}

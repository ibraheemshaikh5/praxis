import { and, desc, eq } from "drizzle-orm";

import { ConflictError, NotFoundError } from "@/lib/daily-planner/errors";
import type { Database } from "@/lib/db/client";
import { profiles, readingItems } from "@/lib/db/schema";

import type { UpdateReadingItemInput } from "./contracts";
import type { ResolvedEntry } from "./resolve";

export class ReadingService {
  constructor(private readonly db: Database) {}

  async listItems(userId: string) {
    const items = await this.db
      .select()
      .from(readingItems)
      .where(eq(readingItems.userId, userId))
      .orderBy(desc(readingItems.createdAt));

    return { items };
  }

  async getItem(userId: string, itemId: string) {
    const [item] = await this.db
      .select()
      .from(readingItems)
      .where(and(eq(readingItems.id, itemId), eq(readingItems.userId, userId)));

    if (!item) throw new NotFoundError();
    return item;
  }

  /**
   * Saving a link that is already on the shelf returns what is there rather
   * than failing: the owner asked for it to be saved, and it is.
   */
  async createItem(userId: string, resolved: ResolvedEntry) {
    await this.requireProfile(userId);

    if (resolved.url) {
      const existing = await this.findByUrl(userId, resolved.url);
      if (existing) return { item: existing, duplicate: true };
    }

    try {
      const [item] = await this.db
        .insert(readingItems)
        .values({
          userId,
          kind: resolved.kind,
          title: resolved.title,
          author: resolved.author,
          source: resolved.source,
          url: resolved.url,
          pdfUrl: resolved.pdfUrl,
          imageUrl: resolved.imageUrl,
          coverOptions: resolved.coverOptions,
        })
        .returning();

      return { item, duplicate: false };
    } catch (error) {
      if (!resolved.url || !isUrlCollision(error)) throw error;

      const existing = await this.findByUrl(userId, resolved.url);
      if (!existing) throw error;
      return { item: existing, duplicate: true };
    }
  }

  async updateItem(
    userId: string,
    itemId: string,
    input: UpdateReadingItemInput,
  ) {
    const [updated] = await this.db
      .update(readingItems)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.author !== undefined ? { author: input.author } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.pdfUrl !== undefined ? { pdfUrl: input.pdfUrl } : {}),
      })
      .where(
        and(
          eq(readingItems.id, itemId),
          eq(readingItems.userId, userId),
          eq(readingItems.version, input.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      // Distinguish a stale editor from an item that is not there.
      await this.getItem(userId, itemId);
      throw new ConflictError(
        "That entry changed somewhere else. Reload and try again.",
      );
    }

    return updated;
  }

  /** Removal is outright: nothing else in the schema points at the row. */
  async deleteItem(userId: string, itemId: string) {
    const [deleted] = await this.db
      .delete(readingItems)
      .where(and(eq(readingItems.id, itemId), eq(readingItems.userId, userId)))
      .returning();

    if (!deleted) throw new NotFoundError();
    return deleted;
  }

  private async findByUrl(userId: string, url: string) {
    const [item] = await this.db
      .select()
      .from(readingItems)
      .where(and(eq(readingItems.userId, userId), eq(readingItems.url, url)));

    return item ?? null;
  }

  private async requireProfile(userId: string) {
    const profile = await this.db.query.profiles.findFirst({
      columns: { id: true },
      where: eq(profiles.id, userId),
    });

    if (!profile) throw new NotFoundError("User profile not found");
  }
}

function isUrlCollision(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "constraint_name" in error &&
    error.constraint_name === "reading_items_user_url_key"
  );
}

import { and, desc, eq } from "drizzle-orm";

import { NotFoundError } from "@/lib/daily-planner/errors";
import type { Database } from "@/lib/db/client";
import { profiles, whiteboards } from "@/lib/db/schema";

import type {
  CreateWhiteboardInput,
  UpdateWhiteboardInput,
  WhiteboardsQuery,
} from "./contracts";

export class WhiteboardsService {
  constructor(private readonly db: Database) {}

  /** Summaries only: the list is a sidebar of titles, not of drawings. */
  async listWhiteboards(userId: string, query: WhiteboardsQuery) {
    const rows = await this.db
      .select({
        id: whiteboards.id,
        title: whiteboards.title,
        createdAt: whiteboards.createdAt,
        updatedAt: whiteboards.updatedAt,
      })
      .from(whiteboards)
      .where(
        and(eq(whiteboards.userId, userId), eq(whiteboards.pageKey, query.key)),
      )
      .orderBy(desc(whiteboards.updatedAt));

    return { whiteboards: rows };
  }

  async getWhiteboard(userId: string, whiteboardId: string) {
    const whiteboard = await this.db.query.whiteboards.findFirst({
      where: and(
        eq(whiteboards.id, whiteboardId),
        eq(whiteboards.userId, userId),
      ),
    });
    if (!whiteboard) throw new NotFoundError("Whiteboard not found");

    return { whiteboard };
  }

  async createWhiteboard(userId: string, input: CreateWhiteboardInput) {
    const profile = await this.db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
    });
    if (!profile) throw new NotFoundError("User profile not found");

    const [whiteboard] = await this.db
      .insert(whiteboards)
      .values({
        userId,
        pageKey: input.pageKey,
        title: input.title,
      })
      .returning();

    return { whiteboard };
  }

  async updateWhiteboard(
    userId: string,
    whiteboardId: string,
    input: UpdateWhiteboardInput,
  ) {
    const [whiteboard] = await this.db
      .update(whiteboards)
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.document === undefined ? {} : { document: input.document }),
      })
      .where(
        and(eq(whiteboards.id, whiteboardId), eq(whiteboards.userId, userId)),
      )
      .returning();
    if (!whiteboard) throw new NotFoundError("Whiteboard not found");

    return { whiteboard };
  }

  async deleteWhiteboard(userId: string, whiteboardId: string) {
    const [whiteboard] = await this.db
      .delete(whiteboards)
      .where(
        and(eq(whiteboards.id, whiteboardId), eq(whiteboards.userId, userId)),
      )
      .returning({ id: whiteboards.id });
    if (!whiteboard) throw new NotFoundError("Whiteboard not found");

    return { whiteboard };
  }
}

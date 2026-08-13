import { and, count, desc, eq, max } from "drizzle-orm";

import { ConflictError, NotFoundError } from "@/lib/daily-planner/errors";
import type { Database } from "@/lib/db/client";
import { connectionMeetings, connections, profiles } from "@/lib/db/schema";

import type {
  CreateMeetingInput,
  UpdateConnectionInput,
  UpdateMeetingInput,
} from "./contracts";
import type { ResolvedConnection } from "./enrich";

export class RolodexService {
  constructor(private readonly db: Database) {}

  async listConnections(userId: string) {
    const [rows, meetings] = await Promise.all([
      this.db
        .select()
        .from(connections)
        .where(eq(connections.userId, userId))
        .orderBy(desc(connections.createdAt)),
      this.db
        .select({
          connectionId: connectionMeetings.connectionId,
          lastMetOn: max(connectionMeetings.metOn),
          meetingCount: count(),
        })
        .from(connectionMeetings)
        .where(eq(connectionMeetings.userId, userId))
        .groupBy(connectionMeetings.connectionId),
    ]);

    const summaries = new Map(
      meetings.map((row) => [row.connectionId, row] as const),
    );

    return {
      connections: rows.map((connection) => {
        const summary = summaries.get(connection.id);
        return {
          ...connection,
          lastMetOn: summary?.lastMetOn ?? null,
          meetingCount: summary?.meetingCount ?? 0,
        };
      }),
    };
  }

  async getConnection(userId: string, connectionId: string) {
    const connection = await this.requireConnection(userId, connectionId);
    const meetings = await this.listMeetings(userId, connectionId);
    return { ...connection, meetings };
  }

  /**
   * Saving a profile that is already in the rolodex opens what is there rather
   * than failing: the same person is not two cards.
   */
  async createConnection(userId: string, resolved: ResolvedConnection) {
    await this.requireProfile(userId);

    if (resolved.linkedinUrl) {
      const existing = await this.findByLinkedinUrl(
        userId,
        resolved.linkedinUrl,
      );
      if (existing) {
        return {
          connection: await this.withMeetings(existing),
          duplicate: true,
        };
      }
    }

    try {
      const [connection] = await this.db
        .insert(connections)
        .values({
          userId,
          name: resolved.name,
          headline: resolved.headline,
          company: resolved.company,
          role: resolved.role,
          location: resolved.location,
          linkedinUrl: resolved.linkedinUrl,
          avatarUrl: resolved.avatarUrl,
        })
        .returning();

      return { connection: { ...connection, meetings: [] }, duplicate: false };
    } catch (error) {
      if (!resolved.linkedinUrl || !isLinkedinCollision(error)) throw error;

      const existing = await this.findByLinkedinUrl(
        userId,
        resolved.linkedinUrl,
      );
      if (!existing) throw error;
      return { connection: await this.withMeetings(existing), duplicate: true };
    }
  }

  async updateConnection(
    userId: string,
    connectionId: string,
    input: UpdateConnectionInput,
  ) {
    // The contract's fields are exactly the columns an owner may set, so they
    // go through as they are; the version is the guard, not one of them.
    const { expectedVersion, ...fields } = input;

    let updated: typeof connections.$inferSelect | undefined;
    try {
      [updated] = await this.db
        .update(connections)
        .set(fields)
        .where(
          and(
            eq(connections.id, connectionId),
            eq(connections.userId, userId),
            eq(connections.version, expectedVersion),
          ),
        )
        .returning();
    } catch (error) {
      if (!isLinkedinCollision(error)) throw error;
      throw new ConflictError(
        "Another card already has that LinkedIn profile.",
      );
    }

    if (!updated) {
      // Distinguish a stale editor from a card that is not there.
      await this.requireConnection(userId, connectionId);
      throw new ConflictError(
        "That card changed somewhere else. Reload and try again.",
      );
    }

    return this.withMeetings(updated);
  }

  /** Removing a person takes the meetings with them; the FK cascades. */
  async deleteConnection(userId: string, connectionId: string) {
    const [deleted] = await this.db
      .delete(connections)
      .where(
        and(eq(connections.id, connectionId), eq(connections.userId, userId)),
      )
      .returning();

    if (!deleted) throw new NotFoundError();
    return deleted;
  }

  async addMeeting(
    userId: string,
    connectionId: string,
    input: CreateMeetingInput,
  ) {
    // The composite foreign key would reject an unknown card with a database
    // error; checking first makes it the 404 it is.
    await this.requireConnection(userId, connectionId);

    const [meeting] = await this.db
      .insert(connectionMeetings)
      .values({
        userId,
        connectionId,
        metOn: input.metOn,
        notes: input.notes ?? null,
      })
      .returning();

    return meeting;
  }

  async updateMeeting(
    userId: string,
    connectionId: string,
    meetingId: string,
    input: UpdateMeetingInput,
  ) {
    const [updated] = await this.db
      .update(connectionMeetings)
      .set({
        ...(input.metOn !== undefined ? { metOn: input.metOn } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(
        and(
          eq(connectionMeetings.id, meetingId),
          eq(connectionMeetings.connectionId, connectionId),
          eq(connectionMeetings.userId, userId),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundError();
    return updated;
  }

  async deleteMeeting(userId: string, connectionId: string, meetingId: string) {
    const [deleted] = await this.db
      .delete(connectionMeetings)
      .where(
        and(
          eq(connectionMeetings.id, meetingId),
          eq(connectionMeetings.connectionId, connectionId),
          eq(connectionMeetings.userId, userId),
        ),
      )
      .returning();

    if (!deleted) throw new NotFoundError();
    return deleted;
  }

  private async listMeetings(userId: string, connectionId: string) {
    return this.db
      .select()
      .from(connectionMeetings)
      .where(
        and(
          eq(connectionMeetings.userId, userId),
          eq(connectionMeetings.connectionId, connectionId),
        ),
      )
      .orderBy(
        desc(connectionMeetings.metOn),
        desc(connectionMeetings.createdAt),
      );
  }

  private async withMeetings(connection: typeof connections.$inferSelect) {
    const meetings = await this.listMeetings(connection.userId, connection.id);
    return { ...connection, meetings };
  }

  private async requireConnection(userId: string, connectionId: string) {
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(
        and(eq(connections.id, connectionId), eq(connections.userId, userId)),
      );

    if (!connection) throw new NotFoundError();
    return connection;
  }

  private async findByLinkedinUrl(userId: string, linkedinUrl: string) {
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.userId, userId),
          eq(connections.linkedinUrl, linkedinUrl),
        ),
      );

    return connection ?? null;
  }

  private async requireProfile(userId: string) {
    const profile = await this.db.query.profiles.findFirst({
      columns: { id: true },
      where: eq(profiles.id, userId),
    });

    if (!profile) throw new NotFoundError("User profile not found");
  }
}

function isLinkedinCollision(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "constraint_name" in error &&
    error.constraint_name === "connections_user_linkedin_url_key"
  );
}

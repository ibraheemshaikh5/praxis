import { and, asc, eq, sql } from "drizzle-orm";

import { ConflictError, NotFoundError } from "@/lib/daily-planner/errors";
import type { Database } from "@/lib/db/client";
import { applications, googleConnections, profiles } from "@/lib/db/schema";

import type {
  ApplicationsQuery,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "./contracts";
import type { SheetRow } from "./sheets";

export const DEFAULT_CYCLE = process.env.APPLICATIONS_CYCLE ?? "S27";

// The unique (user, cycle, number) constraint is the real guard; a single
// retry absorbs the rare race between reading max() and inserting.
const NUMBER_RETRIES = 1;

export type SheetSyncOutcome = {
  status: "synced" | "failed";
  error?: string | null;
};

export class ApplicationsService {
  constructor(private readonly db: Database) {}

  async listApplications(userId: string, query: ApplicationsQuery) {
    const cycle = query.cycle ?? DEFAULT_CYCLE;

    const rows = await this.db
      .select()
      .from(applications)
      .where(
        and(eq(applications.userId, userId), eq(applications.cycle, cycle)),
      )
      .orderBy(asc(applications.applicationNumber));

    return { cycle, applications: rows };
  }

  async getApplication(userId: string, applicationId: string) {
    const [application] = await this.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
        ),
      );

    if (!application) throw new NotFoundError();
    return application;
  }

  async createApplication(userId: string, input: CreateApplicationInput) {
    await this.requireProfile(userId);
    const cycle = input.cycle ?? DEFAULT_CYCLE;

    for (let attempt = 0; ; attempt += 1) {
      const applicationNumber = await this.nextApplicationNumber(userId, cycle);

      try {
        const [application] = await this.db
          .insert(applications)
          .values({
            userId,
            cycle,
            applicationNumber,
            company: input.company,
            title: input.title,
            status: input.status ?? "applied",
            notes: input.notes ?? null,
            appliedOn: input.appliedOn,
          })
          .returning();

        return application;
      } catch (error) {
        if (attempt >= NUMBER_RETRIES || !isNumberCollision(error)) throw error;
      }
    }
  }

  async updateApplication(
    userId: string,
    applicationId: string,
    input: UpdateApplicationInput,
  ) {
    const [updated] = await this.db
      .update(applications)
      .set({
        ...(input.company !== undefined ? { company: input.company } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.appliedOn !== undefined
          ? { appliedOn: input.appliedOn }
          : {}),
      })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
          eq(applications.version, input.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      // Distinguish "someone else moved it along" from "it never existed".
      await this.getApplication(userId, applicationId);
      throw new ConflictError(
        "That application changed somewhere else. Reload and try again.",
      );
    }

    return updated;
  }

  async deleteApplication(userId: string, applicationId: string) {
    const [deleted] = await this.db
      .delete(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
        ),
      )
      .returning();

    if (!deleted) throw new NotFoundError();
    return deleted;
  }

  async markSheetSync(
    userId: string,
    applicationId: string,
    outcome: SheetSyncOutcome,
  ) {
    const [marked] = await this.db
      .update(applications)
      .set({
        sheetSyncStatus: outcome.status,
        sheetSyncedAt: outcome.status === "synced" ? new Date() : null,
        sheetSyncError:
          outcome.status === "failed" ? (outcome.error ?? null) : null,
      })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
        ),
      )
      .returning();

    if (!marked) throw new NotFoundError();
    return marked;
  }

  /**
   * Upserts rows read from the spreadsheet. `(cycle, #)` is the identity, so
   * re-running an import is a no-op rather than a duplicate set.
   */
  async importRows(userId: string, cycle: string, rows: SheetRow[]) {
    await this.requireProfile(userId);
    if (rows.length === 0) return { imported: 0 };

    const values = rows.map((row) => ({
      userId,
      cycle,
      applicationNumber: row.applicationNumber,
      company: row.company,
      title: row.title,
      status: row.status ?? ("applied" as const),
      notes: row.notes,
      appliedOn: row.appliedOn ?? todayCalendarDate(),
      sheetSyncStatus: "synced" as const,
      sheetSyncedAt: new Date(),
    }));

    const imported = await this.db
      .insert(applications)
      .values(values)
      .onConflictDoUpdate({
        target: [
          applications.userId,
          applications.cycle,
          applications.applicationNumber,
        ],
        set: {
          company: sql`excluded.company`,
          title: sql`excluded.title`,
          status: sql`excluded.status`,
          notes: sql`excluded.notes`,
          appliedOn: sql`excluded.applied_on`,
          sheetSyncStatus: sql`excluded.sheet_sync_status`,
          sheetSyncedAt: sql`excluded.sheet_synced_at`,
          sheetSyncError: sql`null`,
        },
      })
      .returning({ id: applications.id });

    return { imported: imported.length };
  }

  async getConnection(userId: string) {
    const [connection] = await this.db
      .select()
      .from(googleConnections)
      .where(eq(googleConnections.userId, userId));

    return connection ?? null;
  }

  async saveConnection(
    userId: string,
    input: {
      googleEmail: string | null;
      refreshTokenCiphertext: string;
      scope: string;
      spreadsheetId: string | null;
    },
  ) {
    await this.requireProfile(userId);

    const [connection] = await this.db
      .insert(googleConnections)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: googleConnections.userId,
        set: {
          googleEmail: input.googleEmail,
          refreshTokenCiphertext: input.refreshTokenCiphertext,
          scope: input.scope,
          spreadsheetId: input.spreadsheetId,
        },
      })
      .returning();

    return connection;
  }

  async markImported(userId: string) {
    await this.db
      .update(googleConnections)
      .set({ lastImportedAt: new Date() })
      .where(eq(googleConnections.userId, userId));
  }

  async deleteConnection(userId: string) {
    await this.db
      .delete(googleConnections)
      .where(eq(googleConnections.userId, userId));
  }

  private async nextApplicationNumber(userId: string, cycle: string) {
    const [row] = await this.db
      .select({
        next: sql<number>`coalesce(max(${applications.applicationNumber}), 0) + 1`,
      })
      .from(applications)
      .where(
        and(eq(applications.userId, userId), eq(applications.cycle, cycle)),
      );

    return Number(row?.next ?? 1);
  }

  private async requireProfile(userId: string) {
    const profile = await this.db.query.profiles.findFirst({
      columns: { id: true },
      where: eq(profiles.id, userId),
    });

    if (!profile) throw new NotFoundError("User profile not found");
  }
}

function isNumberCollision(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "constraint_name" in error &&
    error.constraint_name === "applications_user_cycle_number_key"
  );
}

function todayCalendarDate() {
  return new Date().toISOString().slice(0, 10);
}

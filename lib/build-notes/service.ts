import { and, asc, desc, eq, inArray, max } from "drizzle-orm";

import { NotFoundError, ValidationError } from "@/lib/daily-planner/errors";
import type { Database } from "@/lib/db/client";
import { buildNoteDispatches, buildNotes, profiles } from "@/lib/db/schema";

import type {
  BuildNotesQuery,
  CreateBuildNoteInput,
  DispatchBuildNotesInput,
  UpdateBuildNoteInput,
} from "./contracts";
import { fireRoutine, isDispatchConfigured } from "./dispatch";
import { composeDispatchPrompt } from "./prompt";

const POSITION_STEP = 1024;

// The cloud tab reads recent runs across every page, not a full history.
const DISPATCH_HISTORY_LIMIT = 25;

export class BuildNotesService {
  constructor(private readonly db: Database) {}

  async listBuildNotes(userId: string, query: BuildNotesQuery) {
    const rows = await this.db
      .select({
        note: buildNotes,
        dispatchSessionUrl: buildNoteDispatches.sessionUrl,
      })
      .from(buildNotes)
      .leftJoin(
        buildNoteDispatches,
        eq(buildNotes.lastDispatchId, buildNoteDispatches.id),
      )
      .where(
        and(eq(buildNotes.userId, userId), eq(buildNotes.pageKey, query.key)),
      )
      .orderBy(desc(buildNotes.createdAt));

    return {
      dispatchConfigured: isDispatchConfigured(),
      notes: rows.map((row) => ({
        ...row.note,
        dispatchSessionUrl: row.dispatchSessionUrl,
      })),
    };
  }

  /**
   * Recent dispatches across every page, each with the notes it carried.
   *
   * The routine fire endpoint has no read-back API, so a run's progress is
   * whatever its notes report: a dispatched note is in flight until it is
   * marked done here.
   */
  async listBuildNoteDispatches(userId: string) {
    const dispatches = await this.db
      .select({
        id: buildNoteDispatches.id,
        pageKey: buildNoteDispatches.pageKey,
        sessionId: buildNoteDispatches.sessionId,
        sessionUrl: buildNoteDispatches.sessionUrl,
        noteCount: buildNoteDispatches.noteCount,
        createdAt: buildNoteDispatches.createdAt,
      })
      .from(buildNoteDispatches)
      .where(eq(buildNoteDispatches.userId, userId))
      .orderBy(desc(buildNoteDispatches.createdAt))
      .limit(DISPATCH_HISTORY_LIMIT);

    if (dispatches.length === 0) return { dispatches: [] };

    const notes = await this.db
      .select()
      .from(buildNotes)
      .where(
        and(
          eq(buildNotes.userId, userId),
          inArray(
            buildNotes.lastDispatchId,
            dispatches.map((dispatch) => dispatch.id),
          ),
        ),
      )
      .orderBy(asc(buildNotes.priority), asc(buildNotes.position));

    // A note redispatched later moves to the newer dispatch, so each note
    // appears under exactly one group.
    const grouped = new Map<string, typeof notes>();
    for (const note of notes) {
      if (!note.lastDispatchId) continue;
      const bucket = grouped.get(note.lastDispatchId);
      if (bucket) bucket.push(note);
      else grouped.set(note.lastDispatchId, [note]);
    }

    return {
      dispatches: dispatches.map((dispatch) => ({
        ...dispatch,
        notes: grouped.get(dispatch.id) ?? [],
      })),
    };
  }

  async createBuildNote(userId: string, input: CreateBuildNoteInput) {
    const profile = await this.db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
    });
    if (!profile) throw new NotFoundError("User profile not found");

    const [{ highest } = { highest: null }] = await this.db
      .select({ highest: max(buildNotes.position) })
      .from(buildNotes)
      .where(
        and(
          eq(buildNotes.userId, userId),
          eq(buildNotes.pageKey, input.pageKey),
        ),
      );

    const [note] = await this.db
      .insert(buildNotes)
      .values({
        userId,
        pageKey: input.pageKey,
        body: input.body,
        priority: input.priority,
        position: (highest ?? 0) + POSITION_STEP,
      })
      .returning();

    return { note };
  }

  async updateBuildNote(
    userId: string,
    noteId: string,
    input: UpdateBuildNoteInput,
  ) {
    const [note] = await this.db
      .update(buildNotes)
      .set({
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.status === undefined ? {} : { status: input.status }),
      })
      .where(and(eq(buildNotes.id, noteId), eq(buildNotes.userId, userId)))
      .returning();

    if (!note) throw new NotFoundError("Build note not found");
    return { note };
  }

  async deleteBuildNote(userId: string, noteId: string) {
    const [note] = await this.db
      .delete(buildNotes)
      .where(and(eq(buildNotes.id, noteId), eq(buildNotes.userId, userId)))
      .returning();

    if (!note) throw new NotFoundError("Build note not found");
    return { note };
  }

  async dispatchBuildNotes(userId: string, input: DispatchBuildNotesInput) {
    const selected = await this.db.query.buildNotes.findMany({
      where: and(
        eq(buildNotes.userId, userId),
        eq(buildNotes.pageKey, input.pageKey),
        inArray(buildNotes.id, input.noteIds),
      ),
      orderBy: [asc(buildNotes.priority), asc(buildNotes.position)],
    });

    if (selected.length !== input.noteIds.length) {
      throw new NotFoundError("Some selected notes no longer exist");
    }

    if (selected.some((note) => note.status === "done")) {
      throw new ValidationError("Completed notes cannot be dispatched");
    }

    const prompt = composeDispatchPrompt({
      notes: selected,
      pageKey: input.pageKey,
    });

    // Started before any write so a rejected dispatch leaves no record behind.
    const session = await fireRoutine(prompt);

    return this.db.transaction(async (tx) => {
      const [dispatch] = await tx
        .insert(buildNoteDispatches)
        .values({
          userId,
          pageKey: input.pageKey,
          prompt,
          sessionId: session.sessionId,
          sessionUrl: session.sessionUrl,
          noteCount: selected.length,
        })
        .returning();

      const updated = await tx
        .update(buildNotes)
        .set({ status: "dispatched", lastDispatchId: dispatch.id })
        .where(
          and(
            eq(buildNotes.userId, userId),
            inArray(
              buildNotes.id,
              selected.map((note) => note.id),
            ),
          ),
        )
        .returning();

      const notes = updated.map((note) => ({
        ...note,
        dispatchSessionUrl: dispatch.sessionUrl,
      }));

      return { dispatch, notes };
    });
  }
}

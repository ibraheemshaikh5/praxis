import { beforeAll, expect, it } from "vitest";

import { DailyPlannerService } from "@/lib/daily-planner/service";
import type {
  AttachmentStorage,
  UploadTarget,
} from "@/lib/daily-planner/storage";
import { describeDatabase, useTestDatabase } from "./support/database";

const USER_ONE = "00000000-0000-4000-8000-000000000001";
const USER_TWO = "00000000-0000-4000-8000-000000000002";

describeDatabase("daily planner database integration", () => {
  const { client, db } = useTestDatabase([USER_ONE, USER_TWO]);
  const service = new DailyPlannerService(db);

  beforeAll(async () => {
    const [result] = await client<[{ rlsTables: number; bucket: number }]>`
      select
        (
          select count(*)::integer
          from pg_class
          where relname in (
            'profiles',
            'tasks',
            'planner_entries',
            'task_attachments'
          )
          and relrowsecurity
        ) as "rlsTables",
        (
          select count(*)::integer
          from storage.buckets
          where id = 'task-attachments'
          and public = false
          and file_size_limit = 26214400
        ) as bucket
    `;
    expect(result).toEqual({ rlsTables: 4, bucket: 1 });
  });

  it("handles task lifecycle, move history, inbox, and stale writes", async () => {
    const created = await service.createTask(USER_ONE, {
      title: "Plan the week",
      notes: "Choose three outcomes",
      plannerDate: "2026-07-29",
      startsAt: "2026-07-29T09:00:00-04:00",
      endsAt: "2026-07-29T10:00:00-04:00",
    });
    expect(created.task.version).toBe(1);
    expect(created.entry?.plannerDate).toBe("2026-07-29");

    const completed = await service.setCompletion(USER_ONE, created.task.id, {
      completed: true,
      expectedVersion: 1,
    });
    expect(completed.version).toBe(2);
    await expect(
      service.updateTask(USER_ONE, created.task.id, {
        title: "Stale edit",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const moved = await service.scheduleTask(USER_ONE, created.task.id, {
      plannerDate: "2026-07-30",
      expectedVersion: 2,
    });
    expect(moved.task.version).toBe(3);
    expect(moved.entry?.movedFromEntryId).toBe(created.entry?.id);

    const planner = await service.listPlanner(USER_ONE, {
      from: "2026-07-29",
      to: "2026-07-30",
      inbox: "true",
    });
    expect(planner.entries).toHaveLength(2);
    expect(planner.entries[0]).toMatchObject({
      closureReason: "moved",
      movedToEntryId: moved.entry?.id,
      movedToPlannerDate: "2026-07-30",
    });

    const unscheduled = await service.scheduleTask(USER_ONE, created.task.id, {
      plannerDate: null,
      expectedVersion: 3,
    });
    expect(unscheduled.task.version).toBe(4);
    const inbox = await service.listPlanner(USER_ONE, {
      from: "2026-07-29",
      to: "2026-07-30",
      inbox: "true",
    });
    expect(inbox.inbox.map(({ id }) => id)).toContain(created.task.id);

    const deleted = await service.deleteTask(USER_ONE, created.task.id, 4);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    const restored = await service.restoreTask(
      USER_ONE,
      created.task.id,
      deleted.version,
    );
    expect(restored.deletedAt).toBeNull();
  });

  it("reorders a complete planner day and isolates users", async () => {
    const first = await service.createTask(USER_ONE, {
      title: "First",
      plannerDate: "2026-07-29",
    });
    const second = await service.createTask(USER_ONE, {
      title: "Second",
      plannerDate: "2026-07-29",
    });

    await service.reorderPlanner(USER_ONE, {
      plannerDate: "2026-07-29",
      orderedEntryIds: [second.entry!.id, first.entry!.id],
    });
    const planner = await service.listPlanner(USER_ONE, {
      from: "2026-07-29",
      to: "2026-07-29",
      inbox: "false",
    });
    expect(planner.entries.map(({ id }) => id)).toEqual([
      second.entry!.id,
      first.entry!.id,
    ]);

    const otherUserPlanner = await service.listPlanner(USER_TWO, {
      from: "2026-07-29",
      to: "2026-07-29",
      inbox: "true",
    });
    expect(otherUserPlanner).toEqual({ entries: [], inbox: [] });
  });

  it("verifies, retries, recovers, and purges attachments through storage", async () => {
    const storage = new FakeAttachmentStorage();
    const { task } = await service.createTask(USER_ONE, {
      title: "Attach notes",
    });
    const attachment = await service.reserveAttachment(USER_ONE, task.id, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      byteSize: 128,
    });

    await expect(
      service.confirmAttachment(USER_ONE, task.id, attachment.id, storage),
    ).rejects.toMatchObject({ status: 502 });
    const retry = await service.retryAttachment(
      USER_ONE,
      task.id,
      attachment.id,
    );
    storage.existing.add(retry.storagePath);
    const confirmed = await service.confirmAttachment(
      USER_ONE,
      task.id,
      attachment.id,
      storage,
    );
    expect(confirmed.uploadStatus).toBe("ready");

    const downloadUrl = await service.getAttachmentDownloadUrl(
      USER_ONE,
      task.id,
      attachment.id,
      storage,
    );
    expect(downloadUrl).toBe(`https://download.test/${retry.storagePath}`);
    await expect(
      service.getAttachmentDownloadUrl(
        USER_TWO,
        task.id,
        attachment.id,
        storage,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const deleted = await service.deleteAttachment(
      USER_ONE,
      task.id,
      attachment.id,
    );
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    const restored = await service.restoreAttachment(
      USER_ONE,
      task.id,
      attachment.id,
    );
    expect(restored.deletedAt).toBeNull();

    await client`
      update task_attachments
      set deleted_at = now() - interval '31 days'
      where id = ${attachment.id}
    `;
    const purge = await service.purgeExpired(storage);
    expect(purge.attachments).toBe(1);
    expect(storage.removed).toContain(attachment.storagePath);
  });

  it("enforces RLS for direct authenticated database access", async () => {
    await service.createTask(USER_ONE, { title: "Private task" });

    await client.begin(async (transaction) => {
      await transaction.unsafe("set local role authenticated");
      await transaction`
        select set_config('request.jwt.claim.sub', ${USER_ONE}, true)
      `;
      const [ownerView] = await transaction<[{ count: number }]>`
        select count(*)::integer as count from public.tasks
      `;
      expect(ownerView.count).toBe(1);

      await transaction`
        select set_config('request.jwt.claim.sub', ${USER_TWO}, true)
      `;
      const [otherView] = await transaction<[{ count: number }]>`
        select count(*)::integer as count from public.tasks
      `;
      expect(otherView.count).toBe(0);
    });
  });

  it("requires an owned attachment reservation for storage uploads", async () => {
    const { task } = await service.createTask(USER_ONE, {
      title: "Reserved upload",
    });
    const attachment = await service.reserveAttachment(USER_ONE, task.id, {
      fileName: "evidence.pdf",
      mimeType: "application/pdf",
      byteSize: 256,
    });
    const orphanPath = `${USER_ONE}/${task.id}/orphan`;

    await expect(
      client.begin(async (transaction) => {
        await transaction.unsafe("set local role authenticated");
        await transaction`
          select set_config('request.jwt.claim.sub', ${USER_ONE}, true)
        `;
        await transaction`
          insert into storage.objects (bucket_id, name)
          values ('task-attachments', ${orphanPath})
        `;
      }),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      client.begin(async (transaction) => {
        await transaction.unsafe("set local role authenticated");
        await transaction`
          select set_config('request.jwt.claim.sub', ${USER_ONE}, true)
        `;
        await transaction`
          insert into storage.objects (bucket_id, name)
          values ('task-attachments', ${attachment.storagePath})
        `;
        const [stored] = await transaction<[{ count: number }]>`
          select count(*)::integer as count
          from storage.objects
          where bucket_id = 'task-attachments'
            and name = ${attachment.storagePath}
        `;
        expect(stored.count).toBe(1);
        throw new Error("ROLLBACK_STORAGE_TEST");
      }),
    ).rejects.toThrow("ROLLBACK_STORAGE_TEST");
  });
});

class FakeAttachmentStorage implements AttachmentStorage {
  readonly existing = new Set<string>();
  readonly removed: string[] = [];

  async createUploadTarget(path: string): Promise<UploadTarget> {
    return { path, signedUrl: `https://upload.test/${path}`, token: "token" };
  }

  async createDownloadUrl(path: string) {
    return `https://download.test/${path}`;
  }

  async objectExists(path: string) {
    return this.existing.has(path);
  }

  async remove(paths: string[]) {
    this.removed.push(...paths);
    for (const path of paths) this.existing.delete(path);
  }
}

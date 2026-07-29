# Daily Planner API

All planner routes require a Supabase cookie session. The server derives the
owner from that session; request bodies never contain `user_id`.

## Routes

- `GET /api/planner?from=YYYY-MM-DD&to=YYYY-MM-DD&inbox=true`
  returns planner entries, move destinations, nested tasks and ready
  attachments, plus the optional inbox. Date ranges are limited to 31 days.
- `POST /api/tasks` creates an inbox task or a dated task with an optional time
  block.
- `PATCH /api/tasks/:taskId` edits title or notes.
- `DELETE /api/tasks/:taskId?expectedVersion=N` soft-deletes a task.
- `POST /api/tasks/:taskId/restore` restores a task within 30 days.
- `POST /api/tasks/:taskId/completion` completes or reopens a task.
- `POST /api/tasks/:taskId/schedule` schedules, moves, or unschedules a task.
- `POST /api/planner/reorder` replaces the ordering for one active planner day.
- `POST /api/tasks/:taskId/attachments` reserves attachment metadata and
  returns a signed upload target.
- Attachment `confirm`, `retry`, `restore`, and `DELETE` routes operate below
  `/api/tasks/:taskId/attachments/:attachmentId`.

Task mutations accept `expectedVersion` and return `409 VERSION_CONFLICT` when
the client is stale. A successful task mutation increments `version`.
Nonexistent and non-owned resources both return `404`.

Calendar dates are `YYYY-MM-DD`. Time blocks use ISO 8601 timestamps with an
explicit offset and must remain within the planner date in the profile time
zone.

## Attachment flow

1. Reserve metadata with the task attachment route.
2. Upload to the returned signed target.
3. Call `confirm`; the server verifies the object before marking it ready.
4. Call `retry` for a fresh upload target after a failed confirmation.

Files are private and limited to the MIME types and 25 MiB maximum recorded in
the database migration. Deletion remains recoverable for 30 days.

## Maintenance

`POST /api/internal/maintenance/purge` requires
`Authorization: Bearer <MAINTENANCE_SECRET>`. A deployment scheduler should call
it daily. It removes expired objects through the Supabase Storage API before
deleting their metadata and expired tasks.

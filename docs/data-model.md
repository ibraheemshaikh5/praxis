# Data Model

Status: implemented foundation. Changes continue through migrations.

## Decisions

- Praxis is single-user now, but every record is user-owned so more users can be
  supported later.
- A durable task is separate from its dated planner entries.
- A task without an active planner entry is in the inbox.
- Rescheduling closes the old entry and links the new entry back to it.
- Deletion is recoverable.
- Deleted tasks and attachments are retained for 30 days.
- The interface folds older content after seven days; it does not delete it.
- Eastern Time defines the planner day.
- Attachments are supported without blocking creation or editing.
- Attachments are limited to supported images, PDF, text, and Markdown up to
  25 MiB.
- Recurrence is deferred; future occurrences will be distinct tasks linked to a
  recurrence rule.
- Offline synchronization is out of scope for the first version.

## Tables

### profiles

- `id`: Supabase Auth user ID
- `time_zone`: defaults to `America/New_York`

### tasks

- `id`
- `user_id`
- `title`
- `notes`
- `icon_key`: curated planner icon
- `color_key`: curated planner color
- `completed_at`
- `deleted_at`
- `version`
- `created_at`
- `updated_at`

### planner_entries

- `id`
- `task_id`
- `user_id`
- `planner_date`
- `position`
- `starts_at`
- `ends_at`
- `time_zone`
- `closed_at`
- `closure_reason`
- `moved_from_entry_id`
- `created_at`
- `updated_at`

Only one entry for a task can be active. Optional time blocks are stored with
time-zone awareness and must remain within the planner day.

### task_attachments

- `id`
- `task_id`
- `user_id`
- `storage_path`
- `file_name`
- `mime_type`
- `byte_size`
- `upload_status`
- `deleted_at`
- `created_at`
- `updated_at`

Files live in the private `task-attachments` Supabase Storage bucket.

## Attachment behavior

- Save planner items independently from file uploads.
- Show upload progress and retry failures without losing the planner item.
- Use authenticated access and per-user Storage policies.
- Soft-delete attachment records and retain their objects during recovery.

## Internship applications

Decisions:

- A recruiting cycle is a plain string that names a spreadsheet tab verbatim, so
  a new cycle needs no code change. It is not constrained to a season code: the
  owner's tabs include `F25/W26 Internship` and `YC Automator Batch 1`.
- `application_number` reproduces the sheet's `#` column and is unique within
  `(user, cycle)`. It is assigned by the server, never by the client.
- Postgres is the source of truth; the spreadsheet is a mirror kept current on
  a best-effort basis and never blocks a save.
- Recording a spreadsheet sync result does not increment `version`, because it
  is not owner intent.
- Applications are not deletable in this slice; editing covers mistakes, and a
  delete would leave a hole in the sheet's numbering.

### applications

- `id`
- `user_id`
- `cycle`
- `application_number`
- `company`
- `title`
- `status`: `applied`, `oa_received`, `oa_completed`, `interview`, `offer`,
  `accepted`, `rejected`, `ghosted`
- `notes`
- `applied_on`
- `sheet_sync_status`: `pending`, `synced`, `failed`
- `sheet_synced_at`
- `sheet_sync_error`
- `version`
- `created_at`
- `updated_at`

### google_connections

- `user_id`
- `google_email`
- `refresh_token_ciphertext`: AES-256-GCM, sealed with
  `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `scope`
- `spreadsheet_id`
- `last_imported_at`
- `created_at`
- `updated_at`

Unlike every other table, `google_connections` grants nothing to
`authenticated`: the sealed token must be reachable only over the app's own
connection.

## Whiteboards

Decisions:

- A whiteboard belongs to a page path, the same key `page_notes` uses, so the
  careers board and any later page keep separate drawings without new tables.
- `document` holds the document half of a tldraw editor snapshot verbatim.
  tldraw owns that shape and migrates it on load, so Postgres treats it as an
  opaque object and only bounds its size; the session half (camera, selection)
  is view state and is not stored.
- The canvas autosaves: strokes settle for under a second, then the whole
  document is written. There is no version guard, because a board has one
  editor open at a time and tldraw already owns its own undo history.
- The sidebar reads titles alone; a drawing is fetched only when it is opened.
- Deleting a whiteboard is immediate and permanent, unlike a task.

### whiteboards

- `id`
- `user_id`
- `page_key`: the pathname that opened the board, e.g. `/careers`
- `title`
- `document`: `jsonb`, up to 4 MiB serialized
- `created_at`
- `updated_at`

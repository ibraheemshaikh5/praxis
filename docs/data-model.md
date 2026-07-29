# Daily Planner Data Model

Status: working design. No database schema is final yet.

## Decisions

- Praxis is single-user now, but every record is user-owned so more users can be
  supported later.
- A planner item has a required task and optional note and event fields.
- Deletion is recoverable.
- The interface folds older content after seven days; it does not delete it.
- Eastern Time defines the planner day.
- Attachments are supported without blocking creation or editing.
- Offline synchronization is out of scope for the first version.

## Proposed tables

### profiles

- `id`: Supabase Auth user ID
- `time_zone`: defaults to `America/New_York`

### planner_items

- `id`
- `user_id`
- `planner_date`
- `task`
- `note`
- `event_starts_at`
- `event_ends_at`
- `completed_at`
- `deleted_at`
- `created_at`
- `updated_at`

`task` is required. `note`, event fields, completion, and deletion are optional.
Timestamps are stored with time-zone awareness.

### planner_attachments

- `id`
- `planner_item_id`
- `user_id`
- `storage_path`
- `file_name`
- `mime_type`
- `byte_size`
- `deleted_at`
- `created_at`

Files live in a private Supabase Storage bucket. Database rows store their
metadata and relationship to planner items.

## Attachment behavior

- Save planner items independently from file uploads.
- Show upload progress and retry failures without losing the planner item.
- Use authenticated access and per-user Storage policies.
- Use standard uploads for small files and resumable uploads for larger files.
- Soft-delete attachment records and retain their objects during recovery.

## Remaining decisions

- Whether an event needs recurrence in the first version.
- How long deleted items and attachments remain recoverable.
- Allowed attachment types and maximum file size.

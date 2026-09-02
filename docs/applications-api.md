# Internship Applications API

All routes require a Supabase cookie session; the owner comes from the session.

## Routes

- `GET /api/applications?cycle=S27` returns the cycle's applications ordered by
  `#`. The cycle defaults to `APPLICATIONS_CYCLE`.
- `POST /api/applications` logs an application. The server assigns `#`, so the
  body carries only `company`, `title`, `appliedOn`, and optional `status`,
  `notes`, and `cycle`.
- `PATCH /api/applications/:applicationId` edits any subset of those fields and
  requires `expectedVersion`.
- `POST /api/applications/:applicationId/sync` retries the spreadsheet write.
- `POST /api/applications/import` reads the cycle's tab and upserts every row.
- `GET /api/google/sheets` lists the spreadsheet's tabs for the cycle selector.
- `GET /api/google/connect` redirects to Google's consent screen.
- `GET /api/google/callback` stores the grant and returns to `/applications`.
- `GET /api/google/connection` reports connection state; `DELETE` disconnects.

`PATCH` returns `409 VERSION_CONFLICT` when the client is stale. Requests
without a Google connection return `409 GOOGLE_NOT_CONNECTED`; a Sheets failure
raised directly by a route is `502 GOOGLE_SYNC_ERROR`.

## Cycles

A cycle names a spreadsheet tab verbatim, including casing and punctuation, so
`F25/W26 Internship` is as valid as `S27`. Adding a tab in the spreadsheet is
all it takes to track a new one.

## Numbering

`#` is `max(application_number) + 1` within `(user, cycle)`, guarded by a unique
constraint.

Create and import both repair the tab's numbering first: every row carrying an
application but no `#` is given the next number, in sheet order, and pulled into
Postgres. Without that pass a new application could take a number an existing
row is silently entitled to.

## Sync contract

Postgres is the source of truth and commits first. The spreadsheet write then
runs in the same request and its result is recorded on the row:

- `pending` — no Google account is connected yet.
- `synced` — the row exists in the tab.
- `failed` — the write was rejected; `sheet_sync_error` holds the reason and the
  table offers a retry.

A failed push never fails the request and never rolls back the save. Recording a
sync result does not increment `version`, so it cannot invalidate an open editor.

Sync is one-way, app to sheet, apart from import. Columns are matched by reading
the tab's header row rather than by position, so reordering or adding columns in
the sheet needs no code change; only `#`, `Company`, and `Title` are required.
Writes set one cell per field, leaving other columns and their formulas alone.

Two rules keep writes faithful to a hand-kept sheet:

- A new application goes in the first row whose tracked columns are blank, not
  appended. These tabs carry banded formatting hundreds of rows past the last
  entry, and appending would insert a fresh row while leaving those prepared
  rows stranded.
- Status is written using the wording that tab already uses, matched by
  normalizing case and punctuation. The tabs disagree with each other — one uses
  `Emailed` and `Drafted`, another does not — so imposing our labels would
  fragment a column the owner reads by eye. Our label is the fallback for a
  status the tab has never held.

## Google connection

One connection per user. The refresh token is sealed with AES-256-GCM under
`GOOGLE_TOKEN_ENCRYPTION_KEY` before storage and never leaves the server. The
`google_connections` table has no `authenticated` grants or policies.

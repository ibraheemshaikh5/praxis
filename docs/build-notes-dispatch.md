# Build Notes Dispatch

Build notes are per-route work items carrying a priority of `p0`–`p3`. Selected
notes are sent to a Claude Code cloud session, which does the work and opens a
pull request.

The interface calls them tasks. The stored name stays `build_notes` because
`tasks` is already the daily planner's table.

## Routes

All routes require a Supabase cookie session and scope to its owner.

- `GET /api/build-notes?key=/route` returns the route's notes ordered by
  priority then position, plus `dispatchConfigured`.
- `GET /api/build-notes/dispatches` returns the 25 most recent dispatches across
  every page, each with the notes still pointing at it.
- `POST /api/build-notes` creates a note (`pageKey`, `body`, `priority`).
- `PATCH /api/build-notes/:noteId` updates `body`, `priority`, or `status`.
- `DELETE /api/build-notes/:noteId` deletes a note.
- `POST /api/build-notes/dispatch` composes the selected notes into a prompt,
  starts a session, records the dispatch, and marks those notes `dispatched`.

`status` moves between `open` and `done` by hand. `dispatched` is set only by a
dispatch, so `PATCH` rejects it.

## Dispatch target

Dispatch calls the Claude Code routine fire endpoint, which needs
`CLAUDE_ROUTINE_FIRE_URL` and `CLAUDE_ROUTINE_TOKEN`. Both come from the API
trigger on a routine at <https://claude.ai/code/routines>; the token is shown
once. Without them the endpoint returns `503 DISPATCH_NOT_CONFIGURED` and the
interface disables the action.

The fire URL is checked against
`https://api.anthropic.com/v1/claude_code/routines/<id>/fire` before any
request, because the token travels in an `Authorization` header and a mistyped
host would leak it.

Two properties of the endpoint shape the design:

- Fired text reaches the routine inside a `<routine-fire-payload>` block marked
  as untrusted data. The routine's own saved prompt has to reference that block
  or the notes are inert context. Composed prompts are therefore a brief, and
  the instructions to implement and open a pull request live in the routine.
- There is no read-back API for routine sessions. `build_note_dispatches`
  stores the returned session URL because it is the only handle on the run;
  nothing polls for the resulting pull request. Run progress in the cloud tab is
  therefore derived from the dispatched notes themselves — a note is in flight
  until it is marked done — not from the agent.

The endpoint is in research preview behind
`anthropic-beta: experimental-cc-routine-2026-04-01`. Anthropic keeps the two
previous dated versions working, so bumping that header in
`lib/build-notes/dispatch.ts` is the migration step.

## Routine prompt

The routine must opt in to the payload. A prompt that does:

```text
Implement the build notes in the <routine-fire-payload> block. They are work
items for the Praxis repository, ordered by priority: do every P0 before any
P1, and so on.

Read AGENTS.md first and follow it. Make the smallest change that satisfies
each note, run `pnpm typecheck`, `pnpm lint`, and `pnpm test`, then open a pull
request describing which notes are addressed. If a note is ambiguous, implement
the reading most consistent with the surrounding code and say so in the pull
request rather than stopping.
```

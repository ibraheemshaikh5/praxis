# Praxis Agent Instructions

- Keep repository documentation concise and limited to durable,
  project-specific decisions.
- Do not add generic setup guides, tutorials, or restatements of external
  documentation unless explicitly requested.
- Do not expand work beyond the current vertical slice.
- Keep proposals distinct from decisions made by the project owner.

## Databases

- Production is never a development or test target. Development uses the dev
  Supabase project or the local stack; production holds the owner's real data.
- Every database outside loopback declares itself in `praxis.environment`.
  Guards read that back and refuse a database that does not answer, so an
  unrecognised connection string fails closed rather than being trusted.
- Integration tests reach a database only through `tests/support/database.ts`.
  A suite that opens its own connection skips the guard.
- Migrations reach production only through `pnpm db:migrate:prod`, and only
  after the same migration has been applied to the dev project.

## Interface copy

- Ship only the text the interface needs to work: labels, values, states,
  and errors.
- No taglines, subtitles, welcome lines, or sentences explaining what a
  screen or control is for. The label is the explanation.
- Field hints are limited to constraints the user cannot infer from the
  input ("At least 6 characters."). Not rationale, not encouragement.
- Empty states name the state and stop. The adjacent action speaks for
  itself.

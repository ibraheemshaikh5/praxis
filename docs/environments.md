# Environments

Status: implemented. Praxis has three databases.

## Decisions

- Production holds real data and is not a development or test target.
- Development runs against a dev Supabase project on a separate account, or the
  local stack for offline work.
- Integration tests delete rows, so they get a database of their own.
- A database declares what it is; guards do not infer it from a URL. An
  undeclared remote database is refused rather than assumed safe.
- Migrations are rehearsed on the dev project before production sees them. A
  migration that applies to an empty database can still fail on one holding
  rows.
- Production migrations require `PRAXIS_CONFIRM_PRODUCTION` to name the
  project, so the command cannot be run by reflex.

## Declaration

Each database carries one row in `praxis.environment`, written by
`pnpm db:declare` and never by a migration — a migration would let every
database inherit the same answer. The local stack declares itself through
`supabase/seed.sql` on every reset.

```bash
pnpm db:declare DEV_DIRECT_DATABASE_URL development
```

Loopback is the one exception: an undeclared database on `127.0.0.1` is treated
as development, because the local stack is rebuilt from migrations on demand.

## Commands

| Command | Target | Gate |
| --- | --- | --- |
| `pnpm db:reset` | local stack | local only |
| `pnpm db:migrate:local` | local stack | local only |
| `pnpm db:migrate:dev` | dev project | must declare development or test |
| `pnpm db:migrate:prod:plan` | production | dry run; no confirmation needed |
| `pnpm db:migrate:prod` | production | applied on dev first, plus `PRAXIS_CONFIRM_PRODUCTION` |
| `pnpm test:integration` | `TEST_DATABASE_URL` | must declare development or test |
| `pnpm db:smoke` | every configured variable | read only |

`pnpm db:smoke` prints what each variable resolves to and what that database
says it is. It is the fastest way to catch an environment pointed at the wrong
project.

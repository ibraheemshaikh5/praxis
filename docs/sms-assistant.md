# SMS Assistant

Texting a Sendblue line reads and changes the daily planner and logs job
applications. Claude interprets each text with tools that wrap
`DailyPlannerService` and the application tracker, and the reply is sent back
from the line.

The assistant acts for exactly one planner owner, `SMS_OWNER_USER_ID`, and
only on texts from `SMS_OWNER_PHONE`. There is no sign-in on this path, so the
scheduler's bearer secret and the sender are the whole authorization.

## Flow

Sendblue's free plan has a shared line, no webhooks, and can message only
verified contacts. Texts are therefore pulled, not pushed.

`GET` or `POST /api/internal/sendblue/poll`, with
`Authorization: Bearer <MAINTENANCE_SECRET>`, is called every minute by a
scheduler. It answers `202` at once and polls in the background, since
answering texts can outlast a scheduler's request timeout (30 seconds on
cron-job.org).

1. It lists the owner's inbound texts to `SENDBLUE_FROM_NUMBER` from the last
   15 minutes. Rows are re-checked locally for direction, sender, line, and
   type, so a reaction, a group message or another sender's text is never
   handed to the agent.
2. Each text is recorded in `sms_messages` under its `message_handle` before it
   is answered. That insert is the claim: the windows of consecutive polls
   overlap, and a text already recorded is skipped, so a missed poll loses
   nothing and an overlapping one answers nothing twice.
3. Texts are answered in the order sent, at most five per poll; the rest wait
   for the next poll.
4. A failed reply is logged and not retried. The text stays recorded, so the
   owner is never answered twice for one text.

A text older than 15 minutes when the poller first sees it is ignored rather
than acted on late. Replies take up to one polling interval plus the agent's
own time.

## Decisions

- The agent acts without asking for confirmation, deletes included. Deleted
  tasks stay restorable for 30 days, and the reply offers "undo".
- The model never sees task versions. Each write reads the current version and
  retries once on a conflict, so an edit made in the web app between the read
  and the write does not fail the text.
- History is the last 12 texts within 12 hours. Each reply stores a log of its
  tool calls (`tool_log`) that is fed back with the history, so "undo" or "move
  that one" resolves against ids from earlier texts.
- Times are read and written in the owner's profile time zone.
- `set_task_done` reports which goals the change moved. Progress is compared
  for the period containing the task's planner day (or its completion day when
  unscheduled), not today, so finishing last week's task updates last week.
  Progress is read before the write and again after it; when nothing moved yet
  it is re-read after 400 ms and 1 s before concluding the task counts toward
  no goal. Both reads are skipped when the task is already in that state or
  there are no goals. `get_goals` reads progress on request.
- `add_application` logs a sent application. Given a link, Firecrawl reads the
  company and job title from the posting (JSON extraction, 25 s timeout);
  either one stated in the text wins over the page. The link is stored in the
  application's notes, and an application with the same link, or the same
  company and title, in the cycle is reported as already tracked rather than
  added again. It is filed in `APPLICATIONS_CYCLE`, dated today unless the
  text says otherwise, and mirrored to the spreadsheet like one created in
  the web app. There is no SMS undo for applications.
- Replies are capped at 1,600 characters.
- The model is `claude-opus-5-5` at low effort with server-side refusal
  fallback. `SMS_AGENT_MODEL` overrides the model.

## Configuration

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key |
| `MAINTENANCE_SECRET` | Bearer secret the scheduler sends |
| `SMS_OWNER_PHONE` | The owner's phone, E.164 |
| `SMS_OWNER_USER_ID` | The owner's Supabase user id |
| `SENDBLUE_API_KEY` | API key id |
| `SENDBLUE_API_SECRET` | API secret |
| `SENDBLUE_FROM_NUMBER` | The Sendblue line the owner texts, E.164 |
| `SMS_AGENT_MODEL` | Optional model override |
| `FIRECRAWL_API_KEY` | Optional; without it a link alone can't be logged |

With any required variable missing or malformed the poll route returns
`503 SMS_NOT_CONFIGURED` and records nothing.

The owner's phone must be the Sendblue account's verified contact; the signup
text verifies it. The scheduler can be cron-job.org, or Vercel Cron on a plan
that allows per-minute schedules with `CRON_SECRET` set to
`MAINTENANCE_SECRET`.

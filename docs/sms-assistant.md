# SMS Assistant

Texting reads and changes the daily planner. Claude interprets each text with
tools that wrap `DailyPlannerService`, and the reply is sent back on the same
channel. Two channels share the agent, tools and conversation history:
Sendblue (iMessage, polled) and Twilio (SMS, webhook).

The assistant acts for exactly one planner owner, `SMS_OWNER_USER_ID`, and
only on texts from `SMS_OWNER_PHONE`. There is no sign-in on these paths, so
the provider's authentication and the sender are the whole authorization.

## Sendblue

Sendblue's free plan has a shared line, no webhooks, and can message only
verified contacts. Texts are therefore pulled, not pushed.

`GET` or `POST /api/internal/sendblue/poll`, with
`Authorization: Bearer <MAINTENANCE_SECRET>`, is called every minute by a
scheduler.

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

## Twilio

`POST /api/sms/inbound` is Twilio's incoming-message webhook.

1. The `X-Twilio-Signature` header is checked against `TWILIO_AUTH_TOKEN`. An
   unsigned or forged request gets `403`.
2. A text from any number other than `SMS_OWNER_PHONE` is acknowledged and
   dropped.
3. The text is recorded in `sms_messages`. The unique `provider_sid` makes a
   Twilio retry a no-op.
4. The webhook answers with empty TwiML at once. Twilio waits at most 15
   seconds and a reply can take longer, so the agent runs in `after()` and
   replies through the Twilio REST API.

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
- Replies are capped at 1,600 characters on both channels.
- The model is `claude-opus-5-5` at low effort with server-side refusal
  fallback. `SMS_AGENT_MODEL` overrides the model.

## Configuration

Shared:

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key |
| `SMS_OWNER_PHONE` | The owner's phone, E.164 |
| `SMS_OWNER_USER_ID` | The owner's Supabase user id |
| `SMS_AGENT_MODEL` | Optional model override |

Sendblue, plus `MAINTENANCE_SECRET` for the poll route:

| Variable | Value |
| --- | --- |
| `SENDBLUE_API_KEY` | API key id |
| `SENDBLUE_API_SECRET` | API secret |
| `SENDBLUE_FROM_NUMBER` | The Sendblue line the owner texts, E.164 |

Twilio:

| Variable | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | `AC…` account SID |
| `TWILIO_AUTH_TOKEN` | Signs webhooks and authorizes sends |
| `TWILIO_PHONE_NUMBER` | The Twilio number, E.164 |
| `SMS_WEBHOOK_URL` | Optional. The exact URL configured in Twilio, when it differs from the URL the app sees |

A channel with any required variable missing or malformed returns
`503 SMS_NOT_CONFIGURED` and records nothing. Either channel can be configured
alone.

Setup:

- Sendblue: the owner's phone must be the account's verified contact (the
  signup text verifies it). The scheduler can be Vercel Cron on a plan that
  allows per-minute schedules, with `CRON_SECRET` set to `MAINTENANCE_SECRET`,
  or any external scheduler that sends the bearer header.
- Twilio: set the number's "A message comes in" webhook to
  `https://<host>/api/sms/inbound`, method `POST`. US numbers must complete
  carrier registration before replies are delivered.

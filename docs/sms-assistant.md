# SMS Assistant

Texting a Twilio number reads and changes the daily planner. Claude interprets
each text with tools that wrap `DailyPlannerService`, and texts the reply back.

## Flow

`POST /api/sms/inbound` is Twilio's incoming-message webhook.

1. The `X-Twilio-Signature` header is checked against `TWILIO_AUTH_TOKEN`. An
   unsigned or forged request gets `403`.
2. A text from any number other than `SMS_OWNER_PHONE` is acknowledged and
   dropped. The assistant acts for exactly one planner owner,
   `SMS_OWNER_USER_ID`; there is no sign-in on this path, so the signature and
   the sender are the whole authorization.
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
- The model is `claude-opus-5-5` at low effort with server-side refusal
  fallback. `SMS_AGENT_MODEL` overrides the model.

## Configuration

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key |
| `TWILIO_ACCOUNT_SID` | `AC…` account SID |
| `TWILIO_AUTH_TOKEN` | Signs webhooks and authorizes sends |
| `TWILIO_PHONE_NUMBER` | The Twilio number, E.164 |
| `SMS_OWNER_PHONE` | The owner's phone, E.164 |
| `SMS_OWNER_USER_ID` | The owner's Supabase user id |
| `SMS_WEBHOOK_URL` | Optional. The exact URL configured in Twilio, when it differs from the URL the app sees (a proxy or rewrite in between) |
| `SMS_AGENT_MODEL` | Optional model override |

With any required variable missing or malformed the webhook returns
`503 SMS_NOT_CONFIGURED` and nothing is recorded.

In the Twilio console, set the number's "A message comes in" webhook to
`https://<host>/api/sms/inbound`, method `POST`. US numbers must complete
carrier registration (toll-free verification or A2P 10DLC) before replies are
delivered.

create type public.sms_direction as enum ('inbound', 'outbound');

create table public.sms_messages (
  id uuid primary key default gen_random_uuid() not null,
  user_id uuid not null,
  direction public.sms_direction not null,
  -- Twilio's MessageSid. Twilio retries a webhook it considers failed, so the
  -- unique key is what keeps a retried text from being acted on twice.
  provider_sid text,
  body text not null,
  -- What an outbound reply changed, as the tool calls and their results. Fed
  -- back with the history so a later "undo" or "move that one" can resolve.
  tool_log text,
  created_at timestamp with time zone default now() not null,
  constraint sms_messages_user_id_profiles_id_fk foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint sms_messages_provider_sid_key unique (provider_sid),
  constraint sms_messages_provider_sid_length_check
    check (provider_sid is null or length(provider_sid) between 1 and 64),
  constraint sms_messages_body_length_check check (length(body) <= 1600),
  constraint sms_messages_tool_log_length_check
    check (tool_log is null or length(tool_log) <= 8000)
);

create index sms_messages_user_created_idx
  on public.sms_messages (user_id, created_at desc);

-- Only the server reads and writes the conversation; the browser never does.
alter table public.sms_messages enable row level security;

revoke all on table public.sms_messages from anon, authenticated;
grant all on table public.sms_messages to service_role;

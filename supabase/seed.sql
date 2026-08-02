-- Fixtures are intentionally absent. Integration tests create and remove their
-- own. The declaration below is what the guards read back before writing; it
-- lives here rather than in a migration so hosted databases cannot inherit it.
create schema if not exists praxis;

create table if not exists praxis.environment (
  singleton boolean primary key default true check (singleton),
  name text not null check (name in ('development', 'test', 'production')),
  declared_at timestamptz not null default now()
);

revoke all on schema praxis from anon, authenticated;
revoke all on praxis.environment from anon, authenticated;

insert into praxis.environment (name)
values ('development')
on conflict (singleton) do nothing;

-- Fixtures are intentionally absent. Integration tests create and remove their
-- own. The declaration below is what the guards read back before writing; it
-- lives here rather than in a migration so hosted databases cannot inherit it.
--
-- The CLI prepares every statement in this file before it executes any of them,
-- so a statement naming praxis.environment directly fails to parse against a
-- database that does not have the table yet. Creating and populating it inside
-- one block defers that parse until the block runs.
create schema if not exists praxis;

do $$
begin
  create table if not exists praxis.environment (
    singleton boolean primary key default true check (singleton),
    name text not null check (name in ('development', 'test', 'production')),
    declared_at timestamptz not null default now()
  );

  execute 'revoke all on schema praxis from anon, authenticated';
  execute 'revoke all on praxis.environment from anon, authenticated';

  execute $seed$
    insert into praxis.environment (name)
    values ('development')
    on conflict (singleton) do nothing
  $seed$;
end
$$;

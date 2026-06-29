-- =============================================================================
-- Kimura Kostay — role grants
-- RLS runs ON TOP OF table GRANTs. Supabase normally auto-grants anon/
-- authenticated via default privileges, but tables created through `db push`
-- don't always inherit them — without these, every query is "permission denied
-- for table" (42501) even though the RLS policies are correct.
--
-- Security is still enforced by RLS (0002_rls.sql): a GRANT only says a command
-- is *possible* for a role; the policies decide which rows it may touch.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- DML for client roles; RLS in 0002 restricts what each may actually do.
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;

-- service_role bypasses RLS and needs full access (booking confirms, logs, cron).
grant all on all tables in schema public to service_role;

-- Identity/serial sequences (e.g. activity_logs.id).
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Apply the same defaults to any tables/sequences added by later migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

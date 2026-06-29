-- =============================================================================
-- Kimura Kostay — admin bootstrap
-- The admins table is an allowlist keyed by auth.users.id. Without a row in it,
-- nobody can sign in to /admin (middleware + every admin API call is_admin()).
--
-- This removes the "hunt for the UUID by hand" footgun from the README: create
-- the auth user once (Supabase Studio → Authentication → Add user, or let them
-- sign up), then promote them by EMAIL.
-- =============================================================================

-- promote_admin('owner@example.com') — copies the matching auth.users id into
-- admins. Idempotent. Returns the granted uuid, or raises if no such auth user.
create or replace function public.promote_admin(
  p_email text,
  p_role  text default 'owner'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_id is null then
    raise exception 'No auth user with email %. Create them in Supabase Auth first.', p_email;
  end if;

  insert into public.admins (id, email, full_name, role)
  values (v_id, p_email, p_email, p_role)
  on conflict (id) do update set role = excluded.role, email = excluded.email;

  insert into public.activity_logs (action, category, message, actor)
  values ('admin.promoted', 'auth', format('Granted admin (%s) to %s', p_role, p_email), 'system');

  return v_id;
end;
$$;

-- SECURITY: never expose to client roles. Run only from the SQL editor /
-- service-role, where the operator is already trusted. (Leaving it callable by
-- anon would be a privilege-escalation hole.)
revoke all on function public.promote_admin(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One-shot first-admin seed.
-- Set the email below to the auth user you created, uncomment, and run this
-- migration. Safe to leave commented (it ships as a no-op).
-- ---------------------------------------------------------------------------
-- select public.promote_admin('admin@kimurakostay.com', 'owner');

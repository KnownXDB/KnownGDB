begin;

-- The trigger is invoked by Supabase Auth and must never be callable through
-- the exposed Data API by an untrusted role.
revoke execute on function catalog.bootstrap_admin()
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

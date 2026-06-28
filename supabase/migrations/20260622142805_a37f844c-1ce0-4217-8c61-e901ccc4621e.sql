-- Revoke EXECUTE on internal SECURITY DEFINER functions from PUBLIC/anon/authenticated.
-- These are only used by triggers or invoked internally, not by client code.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_transactions_rollup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_revenue_ensure_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_revenue_resync_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- has_role and is_staff are used inside RLS policies; signed-in users need EXECUTE
-- so policy evaluation works. Keep EXECUTE for authenticated, revoke from anon/PUBLIC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
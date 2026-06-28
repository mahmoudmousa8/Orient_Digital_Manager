
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- Restrict SECURITY DEFINER functions: only allow what's needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

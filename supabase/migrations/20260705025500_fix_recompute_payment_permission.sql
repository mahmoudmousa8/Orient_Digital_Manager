-- Fix permission denied for function recompute_payment by making the trigger functions SECURITY DEFINER
-- and granting execute permission on recompute_payment to authenticated role.

GRANT EXECUTE ON FUNCTION public.recompute_payment(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_payment_transactions_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_payment(OLD.payment_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_payment(NEW.payment_id);
    IF TG_OP = 'UPDATE' AND NEW.payment_id <> OLD.payment_id THEN
      PERFORM public.recompute_payment(OLD.payment_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_revenue_resync_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pid uuid;
BEGIN
  SELECT id INTO v_pid FROM public.payments WHERE revenue_id = NEW.id;
  IF v_pid IS NOT NULL THEN PERFORM public.recompute_payment(v_pid); END IF;
  RETURN NEW;
END;
$$;

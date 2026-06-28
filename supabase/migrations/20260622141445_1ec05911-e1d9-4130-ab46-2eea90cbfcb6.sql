
-- Payment transactions (history of partial payments)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  vodafone_transfer_no text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage all transactions" ON public.payment_transactions
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Clients view own transactions" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      JOIN public.monthly_revenues mr ON mr.id = p.revenue_id
      JOIN public.channels ch ON ch.id = mr.channel_id
      JOIN public.clients cl ON cl.id = ch.client_id
      WHERE p.id = payment_transactions.payment_id
        AND cl.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS payment_transactions_payment_id_idx ON public.payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS monthly_revenues_period_idx ON public.monthly_revenues(period_month);

-- Roll up transactions into payments row
CREATE OR REPLACE FUNCTION public.recompute_payment(_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12,2);
  v_share numeric(12,2);
  v_remaining numeric(12,2);
  v_status payment_status;
  v_last_date date;
  v_last_no text;
BEGIN
  SELECT COALESCE(SUM(amount),0), MAX(transaction_date)
    INTO v_total, v_last_date
  FROM public.payment_transactions WHERE payment_id = _payment_id;

  SELECT mr.client_share INTO v_share
  FROM public.payments p JOIN public.monthly_revenues mr ON mr.id = p.revenue_id
  WHERE p.id = _payment_id;

  v_share := COALESCE(v_share, 0);
  v_remaining := GREATEST(0, v_share - v_total);
  IF v_total <= 0 THEN v_status := 'unpaid';
  ELSIF v_total >= v_share THEN v_status := 'paid';
  ELSE v_status := 'partial';
  END IF;

  SELECT vodafone_transfer_no INTO v_last_no
  FROM public.payment_transactions
  WHERE payment_id = _payment_id
  ORDER BY transaction_date DESC, created_at DESC
  LIMIT 1;

  UPDATE public.payments
     SET amount_paid = v_total,
         remaining = v_remaining,
         status = v_status,
         payment_date = v_last_date,
         vodafone_transfer_no = COALESCE(v_last_no, vodafone_transfer_no),
         updated_at = now()
   WHERE id = _payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_payment_transactions_rollup()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS payment_transactions_rollup ON public.payment_transactions;
CREATE TRIGGER payment_transactions_rollup
AFTER INSERT OR UPDATE OR DELETE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_transactions_rollup();

-- Auto-create payment row for new revenues
CREATE OR REPLACE FUNCTION public.tg_revenue_ensure_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payments (revenue_id, status, amount_paid, remaining)
  VALUES (NEW.id, 'unpaid', 0, COALESCE(NEW.client_share, 0))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revenue_ensure_payment ON public.monthly_revenues;
CREATE TRIGGER revenue_ensure_payment
AFTER INSERT ON public.monthly_revenues
FOR EACH ROW EXECUTE FUNCTION public.tg_revenue_ensure_payment();

-- Recompute payment after revenue update (share may change)
CREATE OR REPLACE FUNCTION public.tg_revenue_resync_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_pid uuid;
BEGIN
  SELECT id INTO v_pid FROM public.payments WHERE revenue_id = NEW.id;
  IF v_pid IS NOT NULL THEN PERFORM public.recompute_payment(v_pid); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revenue_resync_payment ON public.monthly_revenues;
CREATE TRIGGER revenue_resync_payment
AFTER UPDATE ON public.monthly_revenues
FOR EACH ROW EXECUTE FUNCTION public.tg_revenue_resync_payment();

-- Unique constraint to allow upsert by channel+month (for bulk import)
CREATE UNIQUE INDEX IF NOT EXISTS monthly_revenues_channel_period_unique
  ON public.monthly_revenues(channel_id, period_month);

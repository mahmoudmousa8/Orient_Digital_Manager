-- Upgrades database schema for Invoice System, Receipts, and Views.

-- 1. Add views to monthly_revenues and link monthly_revenues, payments, payment_transactions to invoices
ALTER TABLE public.monthly_revenues ADD COLUMN IF NOT EXISTS views BIGINT DEFAULT 0;
ALTER TABLE public.monthly_revenues ADD COLUMN IF NOT EXISTS invoice_id UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_id UUID;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- 2. Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'partial', 'overdue', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  payment_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(12,4) NOT NULL DEFAULT 1.0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_name TEXT NOT NULL DEFAULT 'Orient Digital',
  company_logo TEXT,
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_tax_no TEXT,
  company_cr_no TEXT,
  notes TEXT,
  terms_conditions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create invoice_items table
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  revenue_id UUID REFERENCES public.monthly_revenues(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  views BIGINT DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  client_percentage NUMERIC(5,2),
  client_share NUMERIC(12,2),
  company_share NUMERIC(12,2)
);

-- 4. Create receipts table
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Vodafone Cash',
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create invoice_activity_logs table
CREATE TABLE IF NOT EXISTS public.invoice_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Add Foreign Key constraints on existing tables
ALTER TABLE public.monthly_revenues DROP CONSTRAINT IF EXISTS mr_invoice_id_fkey;
ALTER TABLE public.monthly_revenues ADD CONSTRAINT mr_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS p_invoice_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT p_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS pt_invoice_id_fkey;
ALTER TABLE public.payment_transactions ADD CONSTRAINT pt_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 7. RLS Configuration
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_activity_logs ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_activity_logs TO authenticated;
GRANT ALL ON public.invoice_activity_logs TO service_role;

-- Policies for invoices
DROP POLICY IF EXISTS "Staff manage all invoices" ON public.invoices;
CREATE POLICY "Staff manage all invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Clients read own invoices" ON public.invoices;
CREATE POLICY "Clients read own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- Policies for invoice items
DROP POLICY IF EXISTS "Staff manage all invoice items" ON public.invoice_items;
CREATE POLICY "Staff manage all invoice items" ON public.invoice_items
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Clients read own invoice items" ON public.invoice_items;
CREATE POLICY "Clients read own invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())));

-- Policies for receipts
DROP POLICY IF EXISTS "Staff manage all receipts" ON public.receipts;
CREATE POLICY "Staff manage all receipts" ON public.receipts
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Clients read own receipts" ON public.receipts;
CREATE POLICY "Clients read own receipts" ON public.receipts
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- Policies for activity logs
DROP POLICY IF EXISTS "Staff manage all activity logs" ON public.invoice_activity_logs;
CREATE POLICY "Staff manage all activity logs" ON public.invoice_activity_logs
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Clients view own activity logs" ON public.invoice_activity_logs;
CREATE POLICY "Clients view own activity logs" ON public.invoice_activity_logs
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())));


-- 8. Functions and Triggers for Invoice Recalculation

-- Recompute Invoice balance and status based on linked payments & direct payments
CREATE OR REPLACE FUNCTION public.recompute_invoice(_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount_paid NUMERIC(12,2);
  v_grand_total NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
  v_status TEXT;
  v_last_payment_date DATE;
BEGIN
  -- Sum up direct payment transactions AND transactions linked through monthly revenues
  SELECT COALESCE(SUM(amount), 0), MAX(transaction_date) INTO v_amount_paid, v_last_payment_date
  FROM (
    -- Direct invoice transactions
    SELECT amount, transaction_date FROM public.payment_transactions WHERE invoice_id = _invoice_id
    UNION ALL
    -- Transactions of payments associated with revenues of this invoice
    SELECT pt.amount, pt.transaction_date
      FROM public.payment_transactions pt
      JOIN public.payments p ON p.id = pt.payment_id
      JOIN public.monthly_revenues mr ON mr.id = p.revenue_id
     WHERE mr.invoice_id = _invoice_id
  ) t;

  -- Get grand_total and current status from invoice
  SELECT grand_total, status INTO v_grand_total, v_status FROM public.invoices WHERE id = _invoice_id;

  v_grand_total := COALESCE(v_grand_total, 0);
  v_remaining := GREATEST(0, v_grand_total - v_amount_paid);

  IF v_amount_paid <= 0 THEN
    IF v_status IN ('paid', 'partial') THEN
      v_status := 'issued';
    END IF;
  ELSIF v_amount_paid >= v_grand_total THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.invoices
     SET amount_paid = v_amount_paid,
         remaining_balance = v_remaining,
         status = v_status,
         payment_date = CASE WHEN v_status = 'paid' THEN COALESCE(v_last_payment_date, CURRENT_DATE) ELSE NULL END,
         updated_at = now()
   WHERE id = _invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_invoice(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_invoice(UUID) TO service_role;

-- Recompute Invoice totals from invoice items
CREATE OR REPLACE FUNCTION public.recompute_invoice_totals(_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_rate NUMERIC(5,2);
  v_tax_amount NUMERIC(12,2);
  v_discount_rate NUMERIC(5,2);
  v_discount_amount NUMERIC(12,2);
  v_grand_total NUMERIC(12,2);
BEGIN
  -- Sum the linked invoice items
  SELECT COALESCE(SUM(client_share), SUM(amount), 0) INTO v_subtotal
  FROM public.invoice_items
  WHERE invoice_id = _invoice_id;

  SELECT tax_rate, discount_rate INTO v_tax_rate, v_discount_rate
  FROM public.invoices
  WHERE id = _invoice_id;

  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_discount_rate := COALESCE(v_discount_rate, 0);

  v_discount_amount := ROUND(v_subtotal * v_discount_rate / 100, 2);
  v_tax_amount := ROUND((v_subtotal - v_discount_amount) * v_tax_rate / 100, 2);
  v_grand_total := v_subtotal - v_discount_amount + v_tax_amount;

  UPDATE public.invoices
     SET subtotal = v_subtotal,
         discount_amount = v_discount_amount,
         tax_amount = v_tax_amount,
         grand_total = v_grand_total,
         updated_at = now()
   WHERE id = _invoice_id;

  PERFORM public.recompute_invoice(_invoice_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_invoice_totals(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_totals(UUID) TO service_role;

-- Trigger on invoice_items updates
CREATE OR REPLACE FUNCTION public.tg_invoice_items_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_invoice_totals(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_invoice_totals(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS invoice_items_change ON public.invoice_items;
CREATE TRIGGER invoice_items_change
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_items_change();

-- Sync invoices when payment transactions are logged
CREATE OR REPLACE FUNCTION public.tg_payment_transactions_invoice_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Direct invoice transaction
    IF OLD.invoice_id IS NOT NULL THEN
      PERFORM public.recompute_invoice(OLD.invoice_id);
    END IF;
    -- Linked via payment
    SELECT mr.invoice_id INTO v_invoice_id
      FROM public.payments p
      JOIN public.monthly_revenues mr ON mr.id = p.revenue_id
     WHERE p.id = OLD.payment_id;
    IF v_invoice_id IS NOT NULL THEN
      PERFORM public.recompute_invoice(v_invoice_id);
    END IF;
    RETURN OLD;
  ELSE
    -- Direct invoice transaction
    IF NEW.invoice_id IS NOT NULL THEN
      PERFORM public.recompute_invoice(NEW.invoice_id);
    END IF;
    -- Linked via payment
    SELECT mr.invoice_id INTO v_invoice_id
      FROM public.payments p
      JOIN public.monthly_revenues mr ON mr.id = p.revenue_id
     WHERE p.id = NEW.payment_id;
    IF v_invoice_id IS NOT NULL THEN
      PERFORM public.recompute_invoice(v_invoice_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_invoice_sync ON public.payment_transactions;
CREATE TRIGGER payment_transactions_invoice_sync
AFTER INSERT OR UPDATE OR DELETE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_transactions_invoice_sync();

-- Automatic receipt generator when payment transactions are added
CREATE OR REPLACE FUNCTION public.tg_payment_transactions_auto_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_invoice_id UUID;
  v_receipt_no TEXT;
BEGIN
  -- We only generate receipts for positive payments
  IF NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Find client_id and invoice_id
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id FROM public.invoices WHERE id = NEW.invoice_id;
    v_invoice_id := NEW.invoice_id;
  ELSE
    SELECT cl.id, mr.invoice_id INTO v_client_id, v_invoice_id
      FROM public.payments p
      JOIN public.monthly_revenues mr ON mr.id = p.revenue_id
      JOIN public.channels ch ON ch.id = mr.channel_id
      JOIN public.clients cl ON cl.id = ch.client_id
     WHERE p.id = NEW.payment_id;
  END IF;

  IF v_client_id IS NOT NULL THEN
    v_receipt_no := 'REC-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || lpad(floor(random() * 100000)::text, 5, '0');
    
    INSERT INTO public.receipts (
      receipt_number,
      invoice_id,
      payment_transaction_id,
      client_id,
      amount,
      payment_method,
      receipt_date,
      notes
    ) VALUES (
      v_receipt_no,
      v_invoice_id,
      NEW.id,
      v_client_id,
      NEW.amount,
      'Vodafone Cash',
      NEW.transaction_date,
      NEW.notes
    ) ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_auto_receipt ON public.payment_transactions;
CREATE TRIGGER payment_transactions_auto_receipt
AFTER INSERT ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_transactions_auto_receipt();

-- Recompute payments when revenue views are updated
CREATE OR REPLACE FUNCTION public.tg_revenue_views_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pid UUID;
BEGIN
  -- If invoice_id changes, recompute both old and new invoices
  IF (OLD.invoice_id IS DISTINCT FROM NEW.invoice_id) THEN
    IF OLD.invoice_id IS NOT NULL THEN
      -- Delete invoice item matching this revenue
      DELETE FROM public.invoice_items WHERE revenue_id = OLD.id;
      PERFORM public.recompute_invoice_totals(OLD.invoice_id);
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      -- Create or update invoice item for this revenue
      INSERT INTO public.invoice_items (
        invoice_id,
        channel_id,
        revenue_id,
        description,
        views,
        amount,
        client_percentage,
        client_share,
        company_share
      )
      SELECT 
        NEW.invoice_id,
        NEW.channel_id,
        NEW.id,
        ch.name || ' - أرباح شهر ' || to_char(NEW.period_month, 'YYYY/MM'),
        NEW.views,
        NEW.client_share,
        NEW.client_percentage,
        NEW.client_share,
        NEW.company_share
      FROM public.channels ch
      WHERE ch.id = NEW.channel_id;
      
      PERFORM public.recompute_invoice_totals(NEW.invoice_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revenue_views_sync ON public.monthly_revenues;
CREATE TRIGGER revenue_views_sync
AFTER UPDATE ON public.monthly_revenues
FOR EACH ROW EXECUTE FUNCTION public.tg_revenue_views_sync();

-- Drop not null constraint on payment_id in payment_transactions to support direct invoice payments
ALTER TABLE public.payment_transactions ALTER COLUMN payment_id DROP NOT NULL;

-- Add is_active column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Helper function to check if a user is active
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false)
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user(UUID) TO authenticated;

-- Redefine has_role and is_staff to ensure active status check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND p.is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role IN ('admin','employee') AND p.is_active = true
  )
$$;

-- Update client-side policies to enforce is_active check
DROP POLICY IF EXISTS "Client views own client record" ON public.clients;
CREATE POLICY "Client views own client record" ON public.clients 
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Client views own channels" ON public.channels;
CREATE POLICY "Client views own channels" ON public.channels 
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = channels.client_id AND c.user_id = auth.uid()) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Client views own revenues" ON public.monthly_revenues;
CREATE POLICY "Client views own revenues" ON public.monthly_revenues 
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.channels ch JOIN public.clients c ON c.id = ch.client_id WHERE ch.id = monthly_revenues.channel_id AND c.user_id = auth.uid()) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Client views own payments" ON public.payments;
CREATE POLICY "Client views own payments" ON public.payments 
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.monthly_revenues r JOIN public.channels ch ON ch.id = r.channel_id JOIN public.clients c ON c.id = ch.client_id WHERE r.id = payments.revenue_id AND c.user_id = auth.uid()) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Clients view own transactions" ON public.payment_transactions;
CREATE POLICY "Clients view own transactions" ON public.payment_transactions 
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.payments p JOIN public.monthly_revenues mr ON mr.id = p.revenue_id JOIN public.channels ch ON ch.id = mr.channel_id JOIN public.clients cl ON cl.id = ch.client_id WHERE p.id = payment_transactions.payment_id AND cl.user_id = auth.uid()) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Clients read own invoices" ON public.invoices;
CREATE POLICY "Clients read own invoices" ON public.invoices 
  FOR SELECT TO authenticated USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Clients read own invoice items" ON public.invoice_items;
CREATE POLICY "Clients read own invoice items" ON public.invoice_items 
  FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM public.invoices WHERE client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Clients view own activity logs" ON public.invoice_activity_logs;
CREATE POLICY "Clients view own activity logs" ON public.invoice_activity_logs 
  FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM public.invoices WHERE client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) AND public.is_active_user(auth.uid()));

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

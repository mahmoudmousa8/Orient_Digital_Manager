
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'client');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  vodafone_cash TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Role check function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','employee'))
$$;

-- Auto-create profile + default 'client' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profile policies
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "Staff insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id OR public.is_staff(auth.uid()));

-- User_roles policies (read own; staff read all; only admin writes)
CREATE POLICY "View own or staff all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  vodafone_cash TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage clients" ON public.clients
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Client views own client record" ON public.clients
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Channels
CREATE TYPE public.channel_status AS ENUM ('active','paused','suspended','closed');

CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  link TEXT,
  client_percentage NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (client_percentage >= 0 AND client_percentage <= 100),
  status channel_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage channels" ON public.channels
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Client views own channels" ON public.channels
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = channels.client_id AND c.user_id = auth.uid())
  );

-- Monthly revenue (period_month is first day of the month)
CREATE TABLE public.monthly_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  client_percentage NUMERIC(5,2) NOT NULL,
  client_share NUMERIC(12,2) GENERATED ALWAYS AS (round(total_revenue * client_percentage / 100, 2)) STORED,
  company_share NUMERIC(12,2) GENERATED ALWAYS AS (round(total_revenue * (100 - client_percentage) / 100, 2)) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_revenues TO authenticated;
GRANT ALL ON public.monthly_revenues TO service_role;
ALTER TABLE public.monthly_revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage revenues" ON public.monthly_revenues
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Client views own revenues" ON public.monthly_revenues
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.channels ch
      JOIN public.clients c ON c.id = ch.client_id
      WHERE ch.id = monthly_revenues.channel_id AND c.user_id = auth.uid()
    )
  );

-- Payments
CREATE TYPE public.payment_status AS ENUM ('paid','unpaid','partial');

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_id UUID NOT NULL REFERENCES public.monthly_revenues(id) ON DELETE CASCADE,
  status payment_status NOT NULL DEFAULT 'unpaid',
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining NUMERIC(12,2) NOT NULL DEFAULT 0,
  vodafone_transfer_no TEXT,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revenue_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage payments" ON public.payments
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Client views own payments" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.monthly_revenues r
      JOIN public.channels ch ON ch.id = r.channel_id
      JOIN public.clients c ON c.id = ch.client_id
      WHERE r.id = payments.revenue_id AND c.user_id = auth.uid()
    )
  );

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_channels_updated BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_revenues_updated BEFORE UPDATE ON public.monthly_revenues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

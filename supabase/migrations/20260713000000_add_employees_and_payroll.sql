-- Create employees and payrolls tables for Orient Digital Manager

-- 1. Create employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (salary >= 0),
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create employee_payrolls table
CREATE TABLE IF NOT EXISTS public.employee_payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (salary >= 0),
  attendance_days INTEGER NOT NULL DEFAULT 30 CHECK (attendance_days >= 0),
  absence_days INTEGER NOT NULL DEFAULT 0 CHECK (absence_days >= 0),
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  bonuses NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (bonuses >= 0),
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_pay >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid')),
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month)
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payrolls ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Only admins can read/write payroll and employee data)
DROP POLICY IF EXISTS "Admins manage employees" ON public.employees;
CREATE POLICY "Admins manage employees" ON public.employees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage payrolls" ON public.employee_payrolls;
CREATE POLICY "Admins manage payrolls" ON public.employee_payrolls
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Trigger attachments for update timestamp
CREATE OR REPLACE FUNCTION public.set_employee_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS t_employees_updated ON public.employees;
CREATE TRIGGER t_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

DROP TRIGGER IF EXISTS t_employee_payrolls_updated ON public.employee_payrolls;
CREATE TRIGGER t_employee_payrolls_updated BEFORE UPDATE ON public.employee_payrolls FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

-- 6. Grant Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payrolls TO authenticated;
GRANT ALL ON public.employee_payrolls TO service_role;

-- 7. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

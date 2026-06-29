-- Create systems table
CREATE TABLE IF NOT EXISTS public.systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant access permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.systems TO authenticated;
GRANT ALL ON public.systems TO service_role;

-- Enable RLS
ALTER TABLE public.systems ENABLE ROW LEVEL SECURITY;

-- Policies for systems
CREATE POLICY "Staff manage systems" ON public.systems
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Anyone authenticated can view systems" ON public.systems
  FOR SELECT TO authenticated USING (true);

-- Add new columns to channels
ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES public.systems(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS system_percentage NUMERIC(5,2) DEFAULT 0 CHECK (system_percentage >= 0 AND system_percentage <= 100),
ADD COLUMN IF NOT EXISTS company_percentage NUMERIC(5,2) CHECK (company_percentage >= 0 AND company_percentage <= 100),
ADD COLUMN IF NOT EXISTS is_monetized BOOLEAN NOT NULL DEFAULT true;

-- Update existing channels company_percentage
UPDATE public.channels 
SET company_percentage = 100 - client_percentage 
WHERE company_percentage IS NULL;

ALTER TABLE public.channels ALTER COLUMN company_percentage SET DEFAULT 50;
ALTER TABLE public.channels ALTER COLUMN company_percentage SET NOT NULL;

-- Modify monthly_revenues to support company_percentage and new company_share formula
ALTER TABLE public.monthly_revenues DROP COLUMN IF EXISTS company_share;

ALTER TABLE public.monthly_revenues 
ADD COLUMN IF NOT EXISTS company_percentage NUMERIC(5,2);

-- Update existing monthly_revenues company_percentage
UPDATE public.monthly_revenues 
SET company_percentage = 100 - client_percentage 
WHERE company_percentage IS NULL;

ALTER TABLE public.monthly_revenues ALTER COLUMN company_percentage SET DEFAULT 50;
ALTER TABLE public.monthly_revenues ALTER COLUMN company_percentage SET NOT NULL;

ALTER TABLE public.monthly_revenues 
ADD COLUMN company_share NUMERIC(12,2) GENERATED ALWAYS AS (round(total_revenue * company_percentage / 100, 2)) STORED;



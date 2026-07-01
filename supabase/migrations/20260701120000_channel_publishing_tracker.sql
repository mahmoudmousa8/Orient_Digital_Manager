-- Create channel publishing tracker table
CREATE TABLE IF NOT EXISTS public.channel_publishing_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  month_7 BOOLEAN NOT NULL DEFAULT FALSE, -- يوليو
  month_8 BOOLEAN NOT NULL DEFAULT FALSE, -- أغسطس
  month_9 BOOLEAN NOT NULL DEFAULT FALSE, -- سبتمبر
  month_10 BOOLEAN NOT NULL DEFAULT FALSE, -- أكتوبر
  month_11 BOOLEAN NOT NULL DEFAULT FALSE, -- نوفمبر
  month_12 BOOLEAN NOT NULL DEFAULT FALSE, -- ديسمبر
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT channel_year_unique UNIQUE(channel_id, year)
);

-- Enable RLS
ALTER TABLE public.channel_publishing_tracker ENABLE ROW LEVEL SECURITY;

-- 1. Select policy: all staff (admins and employees) can read all publishing tracker tasks
DROP POLICY IF EXISTS "Staff read all publishing tasks" ON public.channel_publishing_tracker;
CREATE POLICY "Staff read all publishing tasks" ON public.channel_publishing_tracker
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 2. Admin policy: admins can perform any operation on any task
DROP POLICY IF EXISTS "Admin manage all publishing tasks" ON public.channel_publishing_tracker;
CREATE POLICY "Admin manage all publishing tasks" ON public.channel_publishing_tracker
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Employee update policy: employees can update only tasks assigned to them, and must keep them assigned to themselves
DROP POLICY IF EXISTS "Employee update assigned publishing tasks" ON public.channel_publishing_tracker;
CREATE POLICY "Employee update assigned publishing tasks" ON public.channel_publishing_tracker
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

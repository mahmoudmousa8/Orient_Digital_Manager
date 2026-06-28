
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  company_name text NOT NULL DEFAULT 'Orient Digital',
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads settings" ON public.app_settings;
CREATE POLICY "anyone reads settings" ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin manages settings" ON public.app_settings;
CREATE POLICY "admin manages settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS t_app_settings_updated ON public.app_settings;
CREATE TRIGGER t_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (id, company_name) VALUES (true, 'Orient Digital')
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "branding public read" ON storage.objects;
CREATE POLICY "branding public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding admin write" ON storage.objects;
CREATE POLICY "branding admin write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

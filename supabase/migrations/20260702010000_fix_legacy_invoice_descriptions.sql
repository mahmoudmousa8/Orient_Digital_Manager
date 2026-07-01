-- Fix legacy invoice item descriptions by shifting the month by 2 months (e.g. Month 7 becomes Month 5)
DO $$
DECLARE
  r RECORD;
  v_old_month TEXT;
  v_new_month TEXT;
  v_new_desc TEXT;
BEGIN
  FOR r IN SELECT id, description FROM public.invoice_items WHERE description LIKE '%- شهر %' LOOP
    -- Extract YYYY-MM
    v_old_month := substring(r.description from '- شهر (\d{4}-\d{2})');
    IF v_old_month IS NOT NULL THEN
      v_new_month := to_char((to_date(v_old_month, 'YYYY-MM') - interval '2 months'), 'YYYY-MM');
      v_new_desc := replace(r.description, '- شهر ' || v_old_month, '- شهر ' || v_new_month);
      UPDATE public.invoice_items SET description = v_new_desc WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

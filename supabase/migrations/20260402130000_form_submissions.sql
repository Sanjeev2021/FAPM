-- Form submissions table for landing page demo/contact forms
CREATE TABLE public.form_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('demo', 'contact')),
  name text NOT NULL,
  email text NOT NULL,
  company text,
  message text,
  phone text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS: anon can insert (landing page forms), super_admin can read/update
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_can_submit_forms" ON public.form_submissions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "super_admin_full_access" ON public.form_submissions
  FOR ALL TO authenticated
  USING (public.is_super_admin());

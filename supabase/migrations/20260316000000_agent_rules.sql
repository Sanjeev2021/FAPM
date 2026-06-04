-- =============================================================================
-- Agent Rules System — org-level and user-level prompt rules
-- =============================================================================

-- Organization rules (managed by org_admin + super_admin)
CREATE TABLE public.org_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_rules IS 'Organization-level agent behavior rules — injected into system prompt for all org users';

CREATE INDEX idx_org_rules_org ON public.org_rules(organization_id);

-- User rules (self-managed)
CREATE TABLE public.user_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_rules IS 'Personal agent behavior rules — injected into system prompt for this user only';

CREATE INDEX idx_user_rules_user ON public.user_rules(user_id);
CREATE INDEX idx_user_rules_org ON public.user_rules(organization_id);

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.org_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules ENABLE ROW LEVEL SECURITY;

-- org_rules: all org members can read, org_admin + super_admin can write
CREATE POLICY "org_rules_select" ON public.org_rules
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "org_rules_insert" ON public.org_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "org_rules_update" ON public.org_rules
  FOR UPDATE TO authenticated
  USING (
    (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "org_rules_delete" ON public.org_rules
  FOR DELETE TO authenticated
  USING (
    (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "org_rules_service_role" ON public.org_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- user_rules: users manage their own rules only
CREATE POLICY "user_rules_select" ON public.user_rules
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

CREATE POLICY "user_rules_insert" ON public.user_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_org_id()
  );

CREATE POLICY "user_rules_update" ON public.user_rules
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_rules_delete" ON public.user_rules
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_rules_service_role" ON public.user_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
CREATE TRIGGER update_org_rules_updated_at
  BEFORE UPDATE ON public.org_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_rules_updated_at
  BEFORE UPDATE ON public.user_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Seed default org rules for PLS default org
-- =============================================================================
INSERT INTO public.org_rules (organization_id, title, content, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Détection métadonnées', 'Quand l''utilisateur mentionne des informations sur le client (nom, budget, cible, préférences), appelle immédiatement collectMetadata en mode quick pour sauvegarder ces informations.', 0),
  ('00000000-0000-0000-0000-000000000001', 'Langue', 'Réponds toujours en français sauf si l''utilisateur écrit en anglais.', 1),
  ('00000000-0000-0000-0000-000000000001', 'Score minimum', 'Ne recommande jamais de supports avec un score de correspondance inférieur à 40%.', 2);

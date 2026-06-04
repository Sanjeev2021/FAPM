-- ============================================================
-- Multi-Organization Schema Migration
-- Adds organizations, membership, invites, org-scoped data
-- ============================================================

-- ============================================================
-- PART 1: New Tables
-- ============================================================

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization Members (replaces decorative role)
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'commercial' CHECK (role IN ('super_admin', 'org_admin', 'commercial', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Organization Invites
CREATE TABLE public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'commercial' CHECK (role IN ('org_admin', 'commercial', 'viewer')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 2: Add organization_id to existing tables
-- ============================================================

-- Profiles
ALTER TABLE public.profiles
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- Support data tables
ALTER TABLE public.new_00_supports_master
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.new_01_supports_variants
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.new_02_planning_kits_media
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.new_03_visuels
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.new_04_contacts
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- User data tables
ALTER TABLE public.projects
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.pls_flows
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- ============================================================
-- PART 3: Indexes for organization_id columns
-- ============================================================

CREATE INDEX idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX idx_supports_master_org ON public.new_00_supports_master(organization_id);
CREATE INDEX idx_supports_variants_org ON public.new_01_supports_variants(organization_id);
CREATE INDEX idx_planning_kits_org ON public.new_02_planning_kits_media(organization_id);
CREATE INDEX idx_visuels_org ON public.new_03_visuels(organization_id);
CREATE INDEX idx_contacts_org ON public.new_04_contacts(organization_id);
CREATE INDEX idx_projects_org ON public.projects(organization_id);
CREATE INDEX idx_pls_flows_org ON public.pls_flows(organization_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_invites_token ON public.organization_invites(token);
CREATE INDEX idx_org_invites_email ON public.organization_invites(email);

-- ============================================================
-- PART 4: Helper functions (used in RLS policies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT AS $$
  SELECT role FROM public.organization_members
  WHERE user_id = auth.uid() AND organization_id = public.get_user_org_id()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PART 5: Default organization + data backfill
-- ============================================================

-- Create the default org for existing data
INSERT INTO public.organizations (id, name, slug, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'PLS (Default)',
  'pls-default',
  '{"is_default": true}'::jsonb
);

-- Backfill all existing profiles
UPDATE public.profiles
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Backfill all support data
UPDATE public.new_00_supports_master
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE public.new_01_supports_variants
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE public.new_02_planning_kits_media
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE public.new_03_visuels
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE public.new_04_contacts
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Backfill user data
UPDATE public.projects
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE public.pls_flows
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Create membership records for existing users in default org
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', id, 'commercial'
FROM public.profiles
WHERE id NOT IN (
  SELECT user_id FROM public.organization_members
);

-- ============================================================
-- PART 6: RLS Policies for new tables
-- ============================================================

-- Organizations: members can see their org, super_admin sees all
CREATE POLICY "Members can view their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can insert organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin can update organizations"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Org admins can update their own org
CREATE POLICY "Org admin can update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    id = public.get_user_org_id()
    AND public.get_user_role() = 'org_admin'
  )
  WITH CHECK (
    id = public.get_user_org_id()
    AND public.get_user_role() = 'org_admin'
  );

-- Organization Members
CREATE POLICY "Members can view their org members"
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can manage all members"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Org admin can manage their org members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'org_admin'
  );

CREATE POLICY "Org admin can update their org members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'org_admin'
  )
  WITH CHECK (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'org_admin'
  );

CREATE POLICY "Org admin can delete their org members"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'org_admin'
  );

-- Organization Invites
CREATE POLICY "Org admin can view invites for their org"
  ON public.organization_invites FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND (public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "Org admin can create invites for their org"
  ON public.organization_invites FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id = public.get_user_org_id() AND public.get_user_role() = 'org_admin')
    OR public.is_super_admin()
  );

CREATE POLICY "Anyone can read invite by token"
  ON public.organization_invites FOR SELECT TO anon, authenticated
  USING (true);

-- ============================================================
-- PART 7: Updated RLS for org-scoped existing tables
-- ============================================================

-- === new_00_supports_master ===
DROP POLICY IF EXISTS "Anyone can read supports" ON public.new_00_supports_master;
DROP POLICY IF EXISTS "Anyone can insert supports" ON public.new_00_supports_master;
DROP POLICY IF EXISTS "Anyone can update supports" ON public.new_00_supports_master;

CREATE POLICY "Org members can read their supports"
  ON public.new_00_supports_master FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can insert supports"
  ON public.new_00_supports_master FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can insert supports"
  ON public.new_00_supports_master FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Super admin can update supports"
  ON public.new_00_supports_master FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can update supports"
  ON public.new_00_supports_master FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- === new_01_supports_variants ===
DROP POLICY IF EXISTS "Anyone can read variants" ON public.new_01_supports_variants;
DROP POLICY IF EXISTS "Anyone can insert variants" ON public.new_01_supports_variants;
DROP POLICY IF EXISTS "Anyone can update supports variants" ON public.new_01_supports_variants;

CREATE POLICY "Org members can read their variants"
  ON public.new_01_supports_variants FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can insert variants"
  ON public.new_01_supports_variants FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can insert variants"
  ON public.new_01_supports_variants FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Super admin can update variants"
  ON public.new_01_supports_variants FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can update variants"
  ON public.new_01_supports_variants FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- === new_02_planning_kits_media ===
DROP POLICY IF EXISTS "Anyone can read planning" ON public.new_02_planning_kits_media;
DROP POLICY IF EXISTS "Anyone can insert planning" ON public.new_02_planning_kits_media;
DROP POLICY IF EXISTS "Anyone can update planning kits" ON public.new_02_planning_kits_media;

CREATE POLICY "Org members can read their planning kits"
  ON public.new_02_planning_kits_media FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can insert planning kits"
  ON public.new_02_planning_kits_media FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can insert planning kits"
  ON public.new_02_planning_kits_media FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Super admin can update planning kits"
  ON public.new_02_planning_kits_media FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can update planning kits"
  ON public.new_02_planning_kits_media FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- === new_03_visuels ===
DROP POLICY IF EXISTS "Anyone can read visuels" ON public.new_03_visuels;
DROP POLICY IF EXISTS "Anyone can insert visuels" ON public.new_03_visuels;
DROP POLICY IF EXISTS "Anyone can update visuels" ON public.new_03_visuels;

CREATE POLICY "Org members can read their visuels"
  ON public.new_03_visuels FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can insert visuels"
  ON public.new_03_visuels FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can insert visuels"
  ON public.new_03_visuels FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Super admin can update visuels"
  ON public.new_03_visuels FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can update visuels"
  ON public.new_03_visuels FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- === new_04_contacts ===
DROP POLICY IF EXISTS "Anyone can read contacts" ON public.new_04_contacts;
DROP POLICY IF EXISTS "Anyone can insert contacts" ON public.new_04_contacts;
DROP POLICY IF EXISTS "Anyone can update contacts" ON public.new_04_contacts;

CREATE POLICY "Org members can read their contacts"
  ON public.new_04_contacts FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can insert contacts"
  ON public.new_04_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can insert contacts"
  ON public.new_04_contacts FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Super admin can update contacts"
  ON public.new_04_contacts FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role can update contacts"
  ON public.new_04_contacts FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- === projects ===
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "Users can view org projects"
  ON public.projects FOR SELECT TO authenticated
  USING (
    (organization_id = public.get_user_org_id() AND user_id = auth.uid())
    OR (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_org_id()
  );

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND organization_id = public.get_user_org_id())
    OR public.is_super_admin()
  )
  WITH CHECK (
    (user_id = auth.uid() AND organization_id = public.get_user_org_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND organization_id = public.get_user_org_id())
    OR public.is_super_admin()
  );

-- === pls_flows ===
DROP POLICY IF EXISTS "Users can view own flows" ON public.pls_flows;
DROP POLICY IF EXISTS "Users can insert own flows" ON public.pls_flows;
DROP POLICY IF EXISTS "Users can update own flows" ON public.pls_flows;
DROP POLICY IF EXISTS "Users can delete own flows" ON public.pls_flows;

CREATE POLICY "Users can view org flows"
  ON public.pls_flows FOR SELECT TO authenticated
  USING (
    (organization_id = public.get_user_org_id() AND user_id = auth.uid())
    OR (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "Users can insert own flows"
  ON public.pls_flows FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_org_id()
  );

CREATE POLICY "Users can update own flows"
  ON public.pls_flows FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND organization_id = public.get_user_org_id())
    OR public.is_super_admin()
  )
  WITH CHECK (
    (user_id = auth.uid() AND organization_id = public.get_user_org_id())
    OR public.is_super_admin()
  );

CREATE POLICY "Users can delete own flows"
  ON public.pls_flows FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND organization_id = public.get_user_org_id())
    OR public.is_super_admin()
  );

-- === profiles (updated) ===
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- PART 8: updated_at trigger for organizations
-- ============================================================

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

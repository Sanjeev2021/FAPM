-- Allow super admins to delete organizations
CREATE POLICY "Super admin can delete organizations"
  ON public.organizations FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Nullify profiles.organization_id when org is deleted (no CASCADE on this FK)
-- This prevents FK violation and keeps user accounts alive
CREATE OR REPLACE FUNCTION public.nullify_profiles_on_org_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles SET organization_id = NULL WHERE organization_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_nullify_profiles_on_org_delete
  BEFORE DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.nullify_profiles_on_org_delete();

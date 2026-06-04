-- Move super_admin flag from organization_members to profiles
-- Super admin should not belong to any org

-- Step 1: Add is_super_admin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Backfill — mark existing super_admin members
UPDATE public.profiles
SET is_super_admin = true
WHERE id IN (
  SELECT user_id FROM public.organization_members WHERE role = 'super_admin'
);

-- Step 3: Remove super_admin memberships from organization_members
DELETE FROM public.organization_members WHERE role = 'super_admin';

-- Step 4: Clear organization_id on super admin profiles (they don't belong to an org)
UPDATE public.profiles
SET organization_id = NULL
WHERE is_super_admin = true;

-- Step 5: Update is_super_admin() to check profiles instead of organization_members
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 6: Allow super admin to read/update their own profile even without org
-- (existing profile RLS should already allow this via id = auth.uid(), but be explicit)

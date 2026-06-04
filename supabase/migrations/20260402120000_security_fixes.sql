-- Security fixes before production push
-- 1. Lock down organization_invites RLS (if table exists)
-- 2. Drop dead SECURITY DEFINER embedding update functions

-- ============================================================
-- Fix 1: Organization invites — remove blanket read access
-- Table may not exist yet; use DO block to handle gracefully
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_invites') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.organization_invites';
    EXECUTE $pol$
      CREATE POLICY "Org members can read invites for their org"
        ON public.organization_invites FOR SELECT TO authenticated
        USING (
          (organization_id = public.get_user_org_id()
           AND public.get_user_role() IN ('org_admin', 'super_admin'))
          OR public.is_super_admin()
        )
    $pol$;
  END IF;
END $$;

-- ============================================================
-- Fix 2: Drop unused SECURITY DEFINER embedding functions
-- These are dead code — all embedding writes use direct .update()
-- ============================================================
DROP FUNCTION IF EXISTS public.update_embedding(text, text, text, double precision[]);
DROP FUNCTION IF EXISTS public.update_embedding_bigint(text, text, bigint, double precision[]);
DROP FUNCTION IF EXISTS public.update_embedding_text(text, text, text, double precision[]);
DROP FUNCTION IF EXISTS public.update_embedding_supports_master(text, text);
DROP FUNCTION IF EXISTS public.update_embedding_supports_variants(text, text);
DROP FUNCTION IF EXISTS public.update_embedding_planning_kits(bigint, text);
DROP FUNCTION IF EXISTS public.update_embedding_contacts(bigint, text);
DROP FUNCTION IF EXISTS public.update_embedding_visuels(bigint, text);

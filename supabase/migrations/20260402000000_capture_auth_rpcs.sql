-- Capture existing auth RPCs that were missing from migration files.
-- These functions already exist in production but need to be in migrations
-- so that new deployments have them.

CREATE OR REPLACE FUNCTION public.lookup_org_by_code(p_join_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_build_object('found', true, 'name', name, 'slug', slug)
     FROM organizations WHERE join_code = upper(trim(p_join_code))),
    jsonb_build_object('found', false)
  );
$function$;

CREATE OR REPLACE FUNCTION public.join_org_with_code(p_join_code text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org RECORD;
  v_member_id UUID;
  v_member_count INT;
  v_role TEXT;
BEGIN
  -- Find org by join code
  SELECT id, name, slug INTO v_org
  FROM organizations
  WHERE join_code = upper(trim(p_join_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid join code');
  END IF;

  -- Check if already a member
  SELECT id INTO v_member_id
  FROM organization_members
  WHERE organization_id = v_org.id AND user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'organization_id', v_org.id, 'already_member', true);
  END IF;

  -- First joiner becomes org_admin, subsequent joiners become commercial
  SELECT COUNT(*) INTO v_member_count
  FROM organization_members
  WHERE organization_id = v_org.id;

  v_role := CASE WHEN v_member_count = 0 THEN 'org_admin' ELSE 'commercial' END;

  -- Create membership
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org.id, p_user_id, v_role)
  RETURNING id INTO v_member_id;

  -- Set profile org
  UPDATE profiles
  SET organization_id = v_org.id
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'role', v_role,
    'member_id', v_member_id
  );
END;
$function$;

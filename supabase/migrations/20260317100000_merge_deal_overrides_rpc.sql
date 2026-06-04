-- Atomic JSONB merge for deal_overrides on campaign_supports.
-- Both the frontend builder and the adjustSupport tool use this
-- to avoid race conditions when editing concurrently.
-- SECURITY INVOKER: RLS on campaign_supports applies to the calling user.

CREATE OR REPLACE FUNCTION merge_deal_overrides(
  p_support_id UUID,
  p_overrides JSONB
)
RETURNS SETOF campaign_supports
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE campaign_supports
  SET deal_overrides = COALESCE(deal_overrides, '{}'::jsonb) || p_overrides
  WHERE id = p_support_id
  RETURNING *;
$$;

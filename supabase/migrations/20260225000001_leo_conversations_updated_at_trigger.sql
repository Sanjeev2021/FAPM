-- Migration: Add updated_at auto-update trigger to leo_conversations
-- Story 1.1 review fix (H1): updated_at column was defined but never auto-updated on row changes.
-- Uses existing public.update_updated_at_column() function (defined in 20260213000000_full_schema.sql).

CREATE TRIGGER update_leo_conversations_updated_at
  BEFORE UPDATE ON public.leo_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

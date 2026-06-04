-- Migration: Chat-First Architecture — 4 new tables
-- Story 1.1: Database Schema & RLS Policies
-- Tables: leo_conversations, leo_messages, campaign_supports, export_jobs
-- All with RLS, org isolation, service_role bypass, and proper indexes

-- =============================================================================
-- TABLE 1: leo_conversations
-- =============================================================================
CREATE TABLE public.leo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'quoted', 'sent')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leo_conversations IS 'Chat conversations — each conversation IS a campaign';
COMMENT ON COLUMN public.leo_conversations.metadata IS 'Lazy-collected: {agence, annonceur, campagne, contact_nom, contact_email, budget, canaux}';
COMMENT ON COLUMN public.leo_conversations.status IS 'draft → quoted → sent';

CREATE INDEX idx_leo_conversations_org ON public.leo_conversations(organization_id);
CREATE INDEX idx_leo_conversations_user ON public.leo_conversations(user_id);

-- =============================================================================
-- TABLE 2: leo_messages
-- =============================================================================
CREATE TABLE public.leo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.leo_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leo_messages IS 'Individual message rows — parts stores AI SDK UIMessage.parts directly (ADR-1)';
COMMENT ON COLUMN public.leo_messages.parts IS 'Immutable after write. AI SDK UIMessage parts array: text, tool-call, tool-result';

CREATE INDEX idx_leo_messages_conversation ON public.leo_messages(conversation_id);
CREATE INDEX idx_leo_messages_created ON public.leo_messages(conversation_id, created_at);

-- =============================================================================
-- TABLE 3: campaign_supports
-- =============================================================================
CREATE TABLE public.campaign_supports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.leo_conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  support_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  deal_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_selected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaign_supports IS 'Working set of supports per conversation — single source of truth for working panel';
COMMENT ON COLUMN public.campaign_supports.support_data IS 'IMMUTABLE snapshot from RAG: {support_name, support_slug, variant_slug, categorie, lectorat, canal, tarif_brut, tarif_net, ...}';
COMMENT ON COLUMN public.campaign_supports.deal_overrides IS 'MUTABLE user overrides: {quantite, date_parution, date_bouclage, remise_1, remise_exceptionnelle, remise_2}';
COMMENT ON COLUMN public.campaign_supports.is_selected IS 'false = soft deleted, can be re-added via chat';

CREATE INDEX idx_campaign_supports_conversation ON public.campaign_supports(conversation_id);
CREATE INDEX idx_campaign_supports_org ON public.campaign_supports(organization_id);
CREATE INDEX idx_campaign_supports_selected ON public.campaign_supports(conversation_id, is_selected);

-- =============================================================================
-- TABLE 4: export_jobs
-- =============================================================================
CREATE TABLE public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.leo_conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  type TEXT NOT NULL CHECK (type IN ('excel', 'ppt', 'email')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.export_jobs IS 'Async export job queue (ADR-3/8): pending → processing → completed/failed';
COMMENT ON COLUMN public.export_jobs.file_url IS 'Supabase Storage signed URL (1h expiry)';

CREATE INDEX idx_export_jobs_conversation ON public.export_jobs(conversation_id);
CREATE INDEX idx_export_jobs_org ON public.export_jobs(organization_id);
CREATE INDEX idx_export_jobs_status ON public.export_jobs(status) WHERE status = 'pending';

-- =============================================================================
-- RLS: Enable on all 4 tables
-- =============================================================================
ALTER TABLE public.leo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS: leo_conversations
-- Users see own conversations; org_admins see all in org; super_admins see all
-- =============================================================================
CREATE POLICY "leo_conversations_select" ON public.leo_conversations
  FOR SELECT USING (
    (organization_id = public.get_user_org_id() AND user_id = auth.uid())
    OR (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "leo_conversations_insert" ON public.leo_conversations
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "leo_conversations_update" ON public.leo_conversations
  FOR UPDATE USING (
    (organization_id = public.get_user_org_id() AND user_id = auth.uid())
    OR (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "leo_conversations_delete" ON public.leo_conversations
  FOR DELETE USING (
    (organization_id = public.get_user_org_id() AND user_id = auth.uid())
    OR (organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
    OR public.is_super_admin()
  );

CREATE POLICY "leo_conversations_service_role" ON public.leo_conversations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: leo_messages
-- Access scoped via conversation ownership (join to leo_conversations)
-- =============================================================================
CREATE POLICY "leo_messages_select" ON public.leo_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leo_conversations c
      WHERE c.id = conversation_id
        AND (
          (c.organization_id = public.get_user_org_id() AND c.user_id = auth.uid())
          OR (c.organization_id = public.get_user_org_id() AND public.get_user_role() IN ('org_admin', 'super_admin'))
          OR public.is_super_admin()
        )
    )
  );

CREATE POLICY "leo_messages_insert" ON public.leo_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leo_conversations c
      WHERE c.id = conversation_id
        AND (
          (c.organization_id = public.get_user_org_id() AND c.user_id = auth.uid())
          OR public.is_super_admin()
        )
    )
  );

CREATE POLICY "leo_messages_service_role" ON public.leo_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- NOTE: No UPDATE or DELETE user-facing policies on leo_messages — intentional.
-- Messages are immutable after write (ADR-1). Deletions are handled by ON DELETE CASCADE
-- from leo_conversations. All writes in practice go through service_role (Edge Function admin client).

-- =============================================================================
-- RLS: campaign_supports
-- Org-scoped read/write
-- =============================================================================
CREATE POLICY "campaign_supports_select" ON public.campaign_supports
  FOR SELECT USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "campaign_supports_insert" ON public.campaign_supports
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "campaign_supports_update" ON public.campaign_supports
  FOR UPDATE USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "campaign_supports_delete" ON public.campaign_supports
  FOR DELETE USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "campaign_supports_service_role" ON public.campaign_supports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: export_jobs
-- Org-scoped read/write
-- =============================================================================
CREATE POLICY "export_jobs_select" ON public.export_jobs
  FOR SELECT USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "export_jobs_insert" ON public.export_jobs
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "export_jobs_update" ON public.export_jobs
  FOR UPDATE USING (
    organization_id = public.get_user_org_id()
    OR public.is_super_admin()
  );

CREATE POLICY "export_jobs_service_role" ON public.export_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- NOTE: No DELETE user-facing policy on export_jobs — intentional.
-- Export job records are permanent audit entries; deletion is not a supported user action.
-- NOTE: leo_messages_insert only allows own-user or super_admin (not org_admin) directly — intentional.
-- In practice all message inserts come from service_role (chat-orchestrator Edge Function).

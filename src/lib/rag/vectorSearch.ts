import { supabase } from '../supabase';

export interface SupportMasterMatch {
  support_slug: string;
  support: string;
  categorie: string | null;
  lectorat: string | null;
  canal: string | null;
  texte_vectorise: string | null;
  similarity: number;
}

export interface SupportVariantMatch {
  variant_slug: string;
  support: string;
  support_slug: string | null;
  canal: string | null;
  periodicite_print: string | null;
  format_print: string | null;
  tarif_brut: string | null;
  tarif_net: string | null;
  visites_par_mois_web: string | null;
  pages_vues_par_mois_web: string | null;
  nombre_envois_nl: string | null;
  texte_vectorise: string | null;
  similarity: number;
}

export interface PlanningKitMatch {
  id: string;
  variant_slug: string | null;
  support: string | null;
  canal: string | null;
  type: string | null;
  date: string | null;
  periodicite: string | null;
  specs_techniques: string | null;
  notes: string | null;
  texte_vectorise: string | null;
  similarity: number;
}

export interface VisuelMatch {
  id: string;
  variant_slug: string | null;
  support: string | null;
  canal: string | null;
  type_de_format: string | null;
  notes: string | null;
  texte_vectorise: string | null;
  similarity: number;
}

export interface ContactMatch {
  id: string;
  support: string | null;
  nom: string | null;
  prenom: string | null;
  role: string | null;
  notes: string | null;
  texte_vectorise: string | null;
  similarity: number;
}

export interface MultiTableMatch {
  source_table: string;
  record_id: string;
  support: string;
  canal: string;
  content_preview: string;
  similarity: number;
}

export interface PlanningDataItem {
  type: string | null;
  date: string | null;
  periodicite: string | null;
  specs_techniques: string | null;
  notes: string | null;
}

export interface VisuelDataItem {
  fichier_integre: string | null;
  fichier_url: string | null;
  type_de_format: string | null;
  notes: string | null;
}

export interface ContactDataItem {
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  role: string | null;
  notes: string | null;
}

export interface EnrichedSupportMatch {
  variant_slug: string;
  support: string;
  support_slug: string;
  canal: string | null;
  periodicite_print: string | null;
  diffusion_print: number | null;
  format_print: string | null;
  visites_par_mois_web: number | null;
  pages_vues_par_mois_web: number | null;
  nombre_envois_nl: number | null;
  tarif_brut: string | null;
  tarif_net: string | null;
  categorie: string | null;
  lectorat: string | null;
  planning_data: PlanningDataItem[];
  visuels_data: VisuelDataItem[];
  contacts_data: ContactDataItem[];
  similarity: number;
  threshold_used: number;
  url: string | null;
  periodicite_nl: string | null;
  abonnes_nl: number | null;
  taux_ouverture_nl: number | null;
  format_nl: string | null;
  format_web: string | null;
}

async function generateEmbedding(query: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: { query },
  });

  if (error) {
    throw new Error(`Embedding generation failed: ${error.message}`);
  }

  if (!data?.embedding) {
    throw new Error('No embedding returned from server');
  }

  return data.embedding;
}

/** Get org_id from the current user's profile */
async function getCurrentOrgId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  return profile?.organization_id ?? null;
}

export async function searchSupportsMaster(
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<SupportMasterMatch[]> {
  const { matchThreshold = 0.5, matchCount = 10 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_supports_master', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching supports master: ${error.message}`);
  }

  return data || [];
}

export async function searchSupportsVariants(
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<SupportVariantMatch[]> {
  const { matchThreshold = 0.5, matchCount = 10 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_supports_variants', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching supports variants: ${error.message}`);
  }

  return data || [];
}

export async function searchPlanningKits(
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<PlanningKitMatch[]> {
  const { matchThreshold = 0.5, matchCount = 10 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_planning_kits', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching planning kits: ${error.message}`);
  }

  return data || [];
}

export async function searchVisuels(
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<VisuelMatch[]> {
  const { matchThreshold = 0.5, matchCount = 10 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_visuels', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching visuels: ${error.message}`);
  }

  return data || [];
}

export async function searchContacts(
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<ContactMatch[]> {
  const { matchThreshold = 0.5, matchCount = 10 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_contacts', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching contacts: ${error.message}`);
  }

  return data || [];
}

export async function searchAllTables(
  query: string,
  options: {
    matchThreshold?: number;
    matchCountPerTable?: number;
  } = {}
): Promise<MultiTableMatch[]> {
  const { matchThreshold = 0.5, matchCountPerTable = 5 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_all_tables', {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count_per_table: matchCountPerTable,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching all tables: ${error.message}`);
  }

  return data || [];
}

export interface EnrichedSearchResult {
  query: string;
  totalResults: number;
  supportsMaster: SupportMasterMatch[];
  supportsVariants: SupportVariantMatch[];
  planningKits: PlanningKitMatch[];
  visuels: VisuelMatch[];
  contacts: ContactMatch[];
  executionTime: number;
}

export async function performEnrichedSearch(
  query: string,
  options: {
    matchThreshold?: number;
    resultsPerTable?: number;
  } = {}
): Promise<EnrichedSearchResult> {
  const { matchThreshold = 0.5, resultsPerTable = 5 } = options;
  const startTime = Date.now();

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const [supportsMaster, supportsVariants, planningKits, visuels, contacts] = await Promise.all([
    supabase.rpc('match_supports_master', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: resultsPerTable,
      org_id: orgId,
    }),
    supabase.rpc('match_supports_variants', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: resultsPerTable,
      org_id: orgId,
    }),
    supabase.rpc('match_planning_kits', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: resultsPerTable,
      org_id: orgId,
    }),
    supabase.rpc('match_visuels', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: resultsPerTable,
      org_id: orgId,
    }),
    supabase.rpc('match_contacts', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: resultsPerTable,
      org_id: orgId,
    }),
  ]);

  const executionTime = Date.now() - startTime;

  const totalResults =
    (supportsMaster.data?.length || 0) +
    (supportsVariants.data?.length || 0) +
    (planningKits.data?.length || 0) +
    (visuels.data?.length || 0) +
    (contacts.data?.length || 0);

  return {
    query,
    totalResults,
    supportsMaster: supportsMaster.data || [],
    supportsVariants: supportsVariants.data || [],
    planningKits: planningKits.data || [],
    visuels: visuels.data || [],
    contacts: contacts.data || [],
    executionTime,
  };
}

export async function searchSupportsEnriched(
  query: string,
  options: {
    matchCount?: number;
  } = {}
): Promise<EnrichedSupportMatch[]> {
  const { matchCount = 20 } = options;

  const [embedding, orgId] = await Promise.all([
    generateEmbedding(query),
    getCurrentOrgId(),
  ]);

  const { data, error } = await supabase.rpc('match_supports_enriched', {
    query_embedding: embedding,
    match_count: matchCount,
    org_id: orgId,
  });

  if (error) {
    throw new Error(`Error searching enriched supports: ${error.message}`);
  }

  return data || [];
}

export const vectorSearch = {
  searchSupportsMaster,
  searchSupportsVariants,
  searchPlanningKits,
  searchVisuels,
  searchContacts,
  searchAllTables,
  performEnrichedSearch,
  searchSupportsEnriched,
};

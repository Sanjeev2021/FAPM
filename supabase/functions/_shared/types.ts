/** Immutable support snapshot stored in campaign_supports.support_data */
export interface SupportData {
  support_name: string;
  support_slug: string;
  variant_slug: string;
  categorie: string | null;
  lectorat: string | null;
  canal: string; // "Print" | "Web" | "NL"
  type_tarif: 'forfait' | 'cpm' | 'pack' | 'unitaire'; // pricing model: Web→forfait/cpm, NL→pack/unitaire
  periodicite_print: string | null;
  diffusion_print: number | null;
  format_print: string | null;
  visites_par_mois_web: number | null;
  pages_vues_par_mois_web: number | null;
  nombre_envois_nl: number | null;
  tarif_brut: string | null; // TEXT: "4800 €" or "pas de tarif"
  tarif_net: string | null;
  dates_parution: PlanningDate[];
  dates_bouclage: PlanningDate[];
  similarity: number;
  visuels_data: VisuelRecord[] | null;
  contacts_data: ContactRecord[] | null;
  url: string | null;
  periodicite_nl: string | null;
  abonnes_nl: number | null;
  taux_ouverture_nl: number | null;
  format_nl: string | null;
  format_web: string | null;
}

export interface PlanningDate {
  date: string;
  periodicite?: string;
  specs_techniques?: string;
  notes?: string;
}

/** RAG search result from match_supports_enriched RPC */
export interface EnrichedSupportResult {
  variant_slug: string;
  support: string;
  support_slug: string;
  canal: string;
  type_tarif: string | null; // 'forfait' | 'cpm' — nullable for backward compat with old RPC
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
  planning_data: PlanningRecord[] | null;
  visuels_data: VisuelRecord[] | null;
  contacts_data: ContactRecord[] | null;
  similarity: number;
  threshold_used: number;
  url: string | null;
  periodicite_nl: string | null;
  abonnes_nl: number | null;
  taux_ouverture_nl: number | null;
  format_nl: string | null;
  format_web: string | null;
}

export interface PlanningRecord {
  type: string; // "Bouclage" or "Parution"
  date: string;
  periodicite?: string;
  specs_techniques?: string;
  notes?: string;
}

export interface VisuelRecord {
  fichier_integre?: string;
  fichier_url?: string;
  type_de_format?: string;
  notes?: string;
}

export interface ContactRecord {
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  role?: string;
}

/** Chat orchestrator request body */
export interface ChatRequest {
  messages: UIMessageInput[];
  conversationId?: string;
}

/** Minimal UI message shape from frontend */
export interface UIMessageInput {
  role: "user" | "assistant";
  content: string;
  parts?: unknown[];
}

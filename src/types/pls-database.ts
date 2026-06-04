export interface SupportMaster {
  support_slug: string;
  support: string;
  categorie: string | null;
  lectorat: string | null;
  canal: string | null;
  new_01_supports_variants_2: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportVariant {
  variant_slug: string;
  support: string;
  support_slug: string | null;
  canal: string | null;
  periodicite_print: string | null;
  diffusion_print: string | null;
  format_print: string | null;
  visites_par_mois_web: string | null;
  pages_vues_par_mois_web: string | null;
  nombre_envois_nl: string | null;
  tarif_brut: string | null;
  tarif_net: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningKitMedia {
  id: string;
  variant_slug: string | null;
  support: string | null;
  canal: string | null;
  type: string | null;
  date: string | null;
  periodicite: string | null;
  specs_techniques: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visuel {
  id: string;
  variant_slug: string | null;
  support: string | null;
  canal: string | null;
  fichier_integre: string | null;
  fichier_url: string | null;
  type_de_format: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  variant_slug: string | null;
  support: string | null;
  canal: string | null;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PLSDatabase {
  new_00_supports_master: SupportMaster;
  new_01_supports_variants: SupportVariant;
  new_02_planning_kits_media: PlanningKitMedia;
  new_03_visuels: Visuel;
  new_04_contacts: Contact;
}

export type CanalType = 'Print' | 'Web' | 'NL';

export type TypePlanningType = 'Bouclage' | 'Parution';

export interface StrategyRecommendation {
  id: string;
  flow_id: string;
  strategy_type: string;
  strategy_name: string;
  description?: string;
  advantages: string[];
  considerations: string[];
  metrics: {
    supportsCount?: number;
    totalBudget?: number;
    estimatedReach?: number;
    cpm?: number;
  };
  supports_count: number;
  total_budget: number;
  estimated_reach: number;
  channels: string[];
  is_recommended: boolean;
  created_at: string;
}

export interface ExportDocument {
  id: string;
  flow_id: string;
  document_type: 'excel' | 'powerpoint' | 'strategic_text' | 'pdf';
  file_url?: string;
  file_size?: number;
  generation_status: 'pending' | 'generating' | 'ready' | 'error';
  error_message?: string;
  generated_at?: string;
  metadata: Record<string, any>;
  created_at: string;
}

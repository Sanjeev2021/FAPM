import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type CanalType = 'Print' | 'Web' | 'NL';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          company: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          company?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          company?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          client_name: string;
          campaign_name: string;
          objective: string;
          target: string;
          channel: string;
          budget: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_name: string;
          campaign_name: string;
          objective: string;
          target: string;
          channel?: string;
          budget: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_name?: string;
          campaign_name?: string;
          objective?: string;
          target?: string;
          channel?: string;
          budget?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      recommendations: {
        Row: {
          id: string;
          project_id: string;
          content: any;
          media_plan: any;
          estimated_reach: number | null;
          estimated_impressions: number | null;
          confidence_score: number | null;
          generated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          content?: any;
          media_plan?: any;
          estimated_reach?: number | null;
          estimated_impressions?: number | null;
          confidence_score?: number | null;
          generated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          content?: any;
          media_plan?: any;
          estimated_reach?: number | null;
          estimated_impressions?: number | null;
          confidence_score?: number | null;
          generated_at?: string;
          created_at?: string;
        };
      };
      press_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      press_supports: {
        Row: {
          id: string;
          name: string;
          slug: string;
          provider: string;
          user_id: string;
          lectorat: string | null;
          description: string | null;
          metadata: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          provider?: string;
          user_id: string;
          lectorat?: string | null;
          description?: string | null;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          provider?: string;
          user_id?: string;
          lectorat?: string | null;
          description?: string | null;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      press_supports_categories: {
        Row: {
          id: string;
          press_support_id: string;
          press_category_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          press_support_id: string;
          press_category_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          press_support_id?: string;
          press_category_id?: string;
          created_at?: string;
        };
      };
      press_support_variants: {
        Row: {
          id: string;
          press_support_id: string;
          canal: CanalType;
          variant_slug: string;
          format_name: string;
          tarif_brut: number | null;
          remise_pourcent: number | null;
          tarif_net: number | null;
          cpm_net: number | null;
          impressions_mois: number | null;
          visites_mois: number | null;
          abonnes_total: number | null;
          periodicite: string | null;
          disponibilite: boolean;
          specs_techniques: string | null;
          format_fichier: string | null;
          poids_max_mo: number | null;
          dimensions: string | null;
          contact_nom: string | null;
          contact_email: string | null;
          contact_tel: string | null;
          metadata: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          press_support_id: string;
          canal: CanalType;
          variant_slug: string;
          format_name: string;
          tarif_brut?: number | null;
          remise_pourcent?: number | null;
          tarif_net?: number | null;
          cpm_net?: number | null;
          impressions_mois?: number | null;
          visites_mois?: number | null;
          abonnes_total?: number | null;
          periodicite?: string | null;
          disponibilite?: boolean;
          specs_techniques?: string | null;
          format_fichier?: string | null;
          poids_max_mo?: number | null;
          dimensions?: string | null;
          contact_nom?: string | null;
          contact_email?: string | null;
          contact_tel?: string | null;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          press_support_id?: string;
          canal?: CanalType;
          variant_slug?: string;
          format_name?: string;
          tarif_brut?: number | null;
          remise_pourcent?: number | null;
          tarif_net?: number | null;
          cpm_net?: number | null;
          impressions_mois?: number | null;
          visites_mois?: number | null;
          abonnes_total?: number | null;
          periodicite?: string | null;
          disponibilite?: boolean;
          specs_techniques?: string | null;
          format_fichier?: string | null;
          poids_max_mo?: number | null;
          dimensions?: string | null;
          contact_nom?: string | null;
          contact_email?: string | null;
          contact_tel?: string | null;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

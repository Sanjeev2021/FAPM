/*
  # Migration v2: Supports de Presse B2B avec Variants Enrichis

  ## Vue d'ensemble
  Cette version enrichit la table press_support_variants pour stocker TOUTES les données
  nécessaires à la génération de devis et plans média complets.

  ## Changements par rapport à v1

  La table press_support_variants contient maintenant tous les champs métiers requis:
  - Informations de format détaillées
  - Tarifs complets (brut, remise, net, CPM)
  - Métriques d'audience (impressions, visites, abonnés)
  - Périodicité et disponibilité
  - Spécifications techniques
  - Contact commercial dédié (peut différer du support parent)

  ## Structure Complète

  ### 1. press_categories (inchangé)
  Référentiel des catégories métiers

  ### 2. press_supports (simplifié)
  Support parent avec informations générales uniquement.
  Les données spécifiques au canal/format sont dans les variants.

  ### 3. press_supports_categories (inchangé)
  Liaison many-to-many supports <-> catégories

  ### 4. press_support_variants (ENRICHI)
  Chaque variant = 1 ligne de plan média potentielle
  Contient TOUT ce qui est nécessaire pour générer un devis
*/

-- Table des catégories métiers (inchangée)
CREATE TABLE IF NOT EXISTS press_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Table des supports de presse (version simplifiée)
-- Les données spécifiques aux canaux sont dans press_support_variants
CREATE TABLE IF NOT EXISTS press_supports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  provider text DEFAULT 'PLS' NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lectorat text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT unique_slug_per_user UNIQUE (user_id, slug)
);

-- Table de liaison supports <-> catégories (inchangée)
CREATE TABLE IF NOT EXISTS press_supports_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  press_support_id uuid NOT NULL REFERENCES press_supports(id) ON DELETE CASCADE,
  press_category_id uuid NOT NULL REFERENCES press_categories(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT unique_support_category UNIQUE (press_support_id, press_category_id)
);

-- Table des variantes enrichies (VERSION COMPLÈTE)
-- Chaque ligne = 1 format publicitaire avec toutes ses données commerciales
CREATE TABLE IF NOT EXISTS press_support_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  press_support_id uuid NOT NULL REFERENCES press_supports(id) ON DELETE CASCADE,

  -- Identification du variant
  canal text NOT NULL,
  variant_slug text NOT NULL,
  format_name text NOT NULL,

  -- Tarification
  tarif_brut numeric,
  remise_pourcent numeric,
  tarif_net numeric,
  cpm_net numeric,

  -- Métriques d'audience par canal
  impressions_mois integer,
  visites_mois integer,
  abonnes_total integer,

  -- Diffusion
  periodicite text,
  disponibilite boolean DEFAULT true,

  -- Spécifications techniques
  specs_techniques text,
  format_fichier text,
  poids_max_mo numeric,
  dimensions text,

  -- Contact commercial (peut être spécifique au variant)
  contact_nom text,
  contact_email text,
  contact_tel text,

  -- Métadonnées flexibles pour évolutions futures
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT valid_canal CHECK (canal IN ('Print', 'Web', 'NL')),
  CONSTRAINT unique_variant_per_support UNIQUE (press_support_id, canal, variant_slug),
  CONSTRAINT valid_remise CHECK (remise_pourcent IS NULL OR (remise_pourcent >= 0 AND remise_pourcent <= 100)),
  CONSTRAINT positive_impressions CHECK (impressions_mois IS NULL OR impressions_mois >= 0),
  CONSTRAINT positive_visites CHECK (visites_mois IS NULL OR visites_mois >= 0),
  CONSTRAINT positive_abonnes CHECK (abonnes_total IS NULL OR abonnes_total >= 0)
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_press_supports_user_id ON press_supports(user_id);
CREATE INDEX IF NOT EXISTS idx_press_supports_slug ON press_supports(slug);
CREATE INDEX IF NOT EXISTS idx_press_supports_provider ON press_supports(provider);
CREATE INDEX IF NOT EXISTS idx_press_supports_created_at ON press_supports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_press_categories_slug ON press_categories(slug);
CREATE INDEX IF NOT EXISTS idx_press_supports_categories_support ON press_supports_categories(press_support_id);
CREATE INDEX IF NOT EXISTS idx_press_supports_categories_category ON press_supports_categories(press_category_id);
CREATE INDEX IF NOT EXISTS idx_press_support_variants_support ON press_support_variants(press_support_id);
CREATE INDEX IF NOT EXISTS idx_press_support_variants_canal ON press_support_variants(canal);
CREATE INDEX IF NOT EXISTS idx_press_support_variants_disponibilite ON press_support_variants(disponibilite);

-- Activer Row Level Security
ALTER TABLE press_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_supports_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_support_variants ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour press_categories (référentiel partagé)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_categories' AND policyname = 'Authenticated users can view categories'
  ) THEN
    CREATE POLICY "Authenticated users can view categories"
      ON press_categories FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_categories' AND policyname = 'Authenticated users can insert categories'
  ) THEN
    CREATE POLICY "Authenticated users can insert categories"
      ON press_categories FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Politiques RLS pour press_supports (isolation stricte par user_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports' AND policyname = 'Users can view own press supports'
  ) THEN
    CREATE POLICY "Users can view own press supports"
      ON press_supports FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports' AND policyname = 'Users can insert own press supports'
  ) THEN
    CREATE POLICY "Users can insert own press supports"
      ON press_supports FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports' AND policyname = 'Users can update own press supports'
  ) THEN
    CREATE POLICY "Users can update own press supports"
      ON press_supports FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports' AND policyname = 'Users can delete own press supports'
  ) THEN
    CREATE POLICY "Users can delete own press supports"
      ON press_supports FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Politiques RLS pour press_supports_categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports_categories' AND policyname = 'Users can view categories of own supports'
  ) THEN
    CREATE POLICY "Users can view categories of own supports"
      ON press_supports_categories FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_supports_categories.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports_categories' AND policyname = 'Users can link categories to own supports'
  ) THEN
    CREATE POLICY "Users can link categories to own supports"
      ON press_supports_categories FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_supports_categories.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports_categories' AND policyname = 'Users can update categories of own supports'
  ) THEN
    CREATE POLICY "Users can update categories of own supports"
      ON press_supports_categories FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_supports_categories.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_supports_categories.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_supports_categories' AND policyname = 'Users can delete categories from own supports'
  ) THEN
    CREATE POLICY "Users can delete categories from own supports"
      ON press_supports_categories FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_supports_categories.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Politiques RLS pour press_support_variants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_support_variants' AND policyname = 'Users can view variants of own supports'
  ) THEN
    CREATE POLICY "Users can view variants of own supports"
      ON press_support_variants FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_support_variants.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_support_variants' AND policyname = 'Users can insert variants for own supports'
  ) THEN
    CREATE POLICY "Users can insert variants for own supports"
      ON press_support_variants FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_support_variants.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_support_variants' AND policyname = 'Users can update variants of own supports'
  ) THEN
    CREATE POLICY "Users can update variants of own supports"
      ON press_support_variants FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_support_variants.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_support_variants.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'press_support_variants' AND policyname = 'Users can delete variants from own supports'
  ) THEN
    CREATE POLICY "Users can delete variants from own supports"
      ON press_support_variants FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM press_supports
          WHERE press_supports.id = press_support_variants.press_support_id
          AND press_supports.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_press_supports_updated_at'
  ) THEN
    CREATE TRIGGER update_press_supports_updated_at
      BEFORE UPDATE ON press_supports
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_press_support_variants_updated_at'
  ) THEN
    CREATE TRIGGER update_press_support_variants_updated_at
      BEFORE UPDATE ON press_support_variants
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

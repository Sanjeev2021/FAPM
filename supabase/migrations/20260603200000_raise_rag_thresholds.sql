-- Raise RAG search thresholds to reduce low-quality results.
-- Tier 1: 0.40 → 0.50  (only results with ≥ 50% cosine similarity are shown first)
-- Tier 2: 0.25 → 0.35  (fallback for niche queries still gives useful results)
--
-- matchCount stays at 40 to preserve multi-format web/NL coverage.
-- The frontend applies an additional 60% display filter with "voir aussi" expand.

CREATE OR REPLACE FUNCTION public.match_supports_enriched(
  query_embedding public.vector,
  match_count integer DEFAULT 40,
  org_id uuid DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_keyword text DEFAULT NULL
)
RETURNS TABLE(
  variant_slug text, support text, support_slug text, canal text,
  periodicite_print text, diffusion_print integer, format_print text,
  visites_par_mois_web integer, pages_vues_par_mois_web integer,
  nombre_envois_nl integer, tarif_brut text, tarif_net text,
  categorie text, lectorat text, planning_data jsonb,
  visuels_data jsonb, contacts_data jsonb,
  similarity double precision, threshold_used double precision,
  type_tarif text
)
LANGUAGE plpgsql AS $$
DECLARE
  result_count int;
  current_threshold float := 0.50;
  safe_keyword text;
BEGIN
  safe_keyword := CASE
    WHEN p_keyword IS NOT NULL THEN replace(replace(p_keyword, '%', ''), '_', '')
    ELSE NULL
  END;

  CREATE TEMP TABLE IF NOT EXISTS _tmp_match_results (
    variant_slug text, support text, support_slug text, canal text,
    periodicite_print text, diffusion_print integer, format_print text,
    visites_par_mois_web integer, pages_vues_par_mois_web integer,
    nombre_envois_nl integer, tarif_brut text, tarif_net text,
    categorie text, lectorat text, planning_data jsonb,
    visuels_data jsonb, contacts_data jsonb,
    similarity double precision, threshold_used double precision,
    type_tarif text
  ) ON COMMIT DROP;
  TRUNCATE _tmp_match_results;

  -- ── Tier 1: threshold 0.50 ─────────────────────────────────
  INSERT INTO _tmp_match_results
  WITH search_results AS (
    SELECT
      v.variant_slug, v.support, v.support_slug, v.canal,
      v.periodicite_print, v.diffusion_print, v.format_print,
      v.visites_par_mois_web, v.pages_vues_par_mois_web,
      v.nombre_envois_nl, v.tarif_brut, v.tarif_net,
      m.categorie, m.lectorat,
      COALESCE(v.type_tarif, 'forfait') AS type_tarif,
      1 - (v.embedding <=> query_embedding) AS sim_score
    FROM new_01_supports_variants v
    LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
      AND (org_id IS NULL OR m.organization_id = org_id)
    WHERE v.embedding IS NOT NULL
      AND (org_id IS NULL OR v.organization_id = org_id)
      AND (p_canal IS NULL OR v.canal ILIKE '%' || p_canal || '%')
      AND (
        1 - (v.embedding <=> query_embedding) > current_threshold
        OR (safe_keyword IS NOT NULL AND (
          m.categorie ILIKE '%' || safe_keyword || '%'
          OR m.lectorat ILIKE '%' || safe_keyword || '%'
        ))
      )
    ORDER BY v.embedding <=> query_embedding
    LIMIT match_count
  ),
  enriched_results AS (
    SELECT
      sr.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'type', p.type, 'date', p.date_supabase,
          'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques,
          'notes', p.notes
        ) ORDER BY p.date_supabase)
        FROM new_02_planning_kits_media p
        WHERE p.variant_slug = sr.variant_slug
          AND (org_id IS NULL OR p.organization_id = org_id)
      ), '[]'::jsonb) AS planning_data,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url,
          'type_de_format', visu.type_de_format, 'notes', visu.notes
        ))
        FROM new_03_visuels visu
        WHERE visu.variant_slug = sr.variant_slug
          AND (org_id IS NULL OR visu.organization_id = org_id)
      ), '[]'::jsonb) AS visuels_data,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'nom', c.nom, 'prenom', c.prenom, 'email', c.email,
          'telephone', c.telephone, 'role', c.role, 'notes', c.notes
        ))
        FROM new_04_contacts c
        WHERE c.variant_slug = sr.variant_slug
          AND (org_id IS NULL OR c.organization_id = org_id)
      ), '[]'::jsonb) AS contacts_data
    FROM search_results sr
  )
  SELECT
    er.variant_slug, er.support, er.support_slug, er.canal,
    er.periodicite_print, er.diffusion_print, er.format_print,
    er.visites_par_mois_web, er.pages_vues_par_mois_web,
    er.nombre_envois_nl, er.tarif_brut, er.tarif_net,
    er.categorie, er.lectorat,
    er.planning_data, er.visuels_data, er.contacts_data,
    er.sim_score, current_threshold::float8,
    er.type_tarif
  FROM enriched_results er;

  GET DIAGNOSTICS result_count = ROW_COUNT;

  -- ── Tier 2: cascade to 0.35 if insufficient results ────────
  IF result_count < match_count THEN
    current_threshold := 0.35;
    TRUNCATE _tmp_match_results;

    INSERT INTO _tmp_match_results
    WITH search_results AS (
      SELECT
        v.variant_slug, v.support, v.support_slug, v.canal,
        v.periodicite_print, v.diffusion_print, v.format_print,
        v.visites_par_mois_web, v.pages_vues_par_mois_web,
        v.nombre_envois_nl, v.tarif_brut, v.tarif_net,
        m.categorie, m.lectorat,
        COALESCE(v.type_tarif, 'forfait') AS type_tarif,
        1 - (v.embedding <=> query_embedding) AS sim_score
      FROM new_01_supports_variants v
      LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
        AND (org_id IS NULL OR m.organization_id = org_id)
      WHERE v.embedding IS NOT NULL
        AND (org_id IS NULL OR v.organization_id = org_id)
        AND (p_canal IS NULL OR v.canal ILIKE '%' || p_canal || '%')
        AND (
          1 - (v.embedding <=> query_embedding) > current_threshold
          OR (safe_keyword IS NOT NULL AND (
            m.categorie ILIKE '%' || safe_keyword || '%'
            OR m.lectorat ILIKE '%' || safe_keyword || '%'
          ))
        )
      ORDER BY v.embedding <=> query_embedding
      LIMIT match_count
    ),
    enriched_results AS (
      SELECT
        sr.*,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'type', p.type, 'date', p.date_supabase,
            'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques,
            'notes', p.notes
          ) ORDER BY p.date_supabase)
          FROM new_02_planning_kits_media p
          WHERE p.variant_slug = sr.variant_slug
            AND (org_id IS NULL OR p.organization_id = org_id)
        ), '[]'::jsonb) AS planning_data,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url,
            'type_de_format', visu.type_de_format, 'notes', visu.notes
          ))
          FROM new_03_visuels visu
          WHERE visu.variant_slug = sr.variant_slug
            AND (org_id IS NULL OR visu.organization_id = org_id)
        ), '[]'::jsonb) AS visuels_data,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'nom', c.nom, 'prenom', c.prenom, 'email', c.email,
            'telephone', c.telephone, 'role', c.role, 'notes', c.notes
          ))
          FROM new_04_contacts c
          WHERE c.variant_slug = sr.variant_slug
            AND (org_id IS NULL OR c.organization_id = org_id)
        ), '[]'::jsonb) AS contacts_data
      FROM search_results sr
    )
    SELECT
      er.variant_slug, er.support, er.support_slug, er.canal,
      er.periodicite_print, er.diffusion_print, er.format_print,
      er.visites_par_mois_web, er.pages_vues_par_mois_web,
      er.nombre_envois_nl, er.tarif_brut, er.tarif_net,
      er.categorie, er.lectorat,
      er.planning_data, er.visuels_data, er.contacts_data,
      er.sim_score, current_threshold::float8,
      er.type_tarif
    FROM enriched_results er;
  END IF;

  RETURN QUERY SELECT * FROM _tmp_match_results ORDER BY _tmp_match_results.similarity DESC;
END;
$$;

-- ============================================================
-- Multi-Organization RPC Functions Migration
-- Adds org_id parameter to all vector search functions
-- ============================================================

-- ============================================================
-- 1. match_supports_master
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_supports_master(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 10,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  support_slug text, support text, categorie text, lectorat text,
  canal text, periodicite_print text, diffusion_print integer,
  format_print text, tarif_net text, tarif_brut text,
  texte_vectorise text, similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
SELECT DISTINCT ON (m.support_slug)
  m.support_slug, m.support, m.categorie, m.lectorat, m.canal,
  v.periodicite_print, v.diffusion_print, v.format_print,
  v.tarif_net, v.tarif_brut, m.texte_vectorise,
  1 - (m.embedding <=> query_embedding) AS similarity
FROM new_00_supports_master m
LEFT JOIN new_01_supports_variants v ON m.support_slug = v.support_slug
WHERE m.embedding IS NOT NULL
  AND 1 - (m.embedding <=> query_embedding) > match_threshold
  AND (org_id IS NULL OR m.organization_id = org_id)
ORDER BY m.support_slug, similarity DESC
LIMIT match_count;
END;
$$;

-- ============================================================
-- 2. match_supports_variants
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_supports_variants(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 10,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  variant_slug text, support text, support_slug text, canal text,
  periodicite_print text, diffusion_print integer, format_print text,
  tarif_brut text, tarif_net text, visites_par_mois_web integer,
  pages_vues_par_mois_web integer, nombre_envois_nl integer,
  categorie text, lectorat text, texte_vectorise text,
  similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
SELECT
  v.variant_slug, v.support, v.support_slug, v.canal,
  v.periodicite_print, v.diffusion_print, v.format_print,
  v.tarif_brut, v.tarif_net, v.visites_par_mois_web,
  v.pages_vues_par_mois_web, v.nombre_envois_nl,
  m.categorie, m.lectorat, v.texte_vectorise,
  1 - (v.embedding <=> query_embedding) AS similarity
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
  AND 1 - (v.embedding <=> query_embedding) > match_threshold
  AND (org_id IS NULL OR v.organization_id = org_id)
ORDER BY similarity DESC
LIMIT match_count;
END;
$$;

-- ============================================================
-- 3. match_planning_kits
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_planning_kits(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 10,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, variant_slug text, support text, canal text,
  type text, date text, periodicite text, specs_techniques text,
  notes text, texte_vectorise text, similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
SELECT
  new_02_planning_kits_media.id,
  new_02_planning_kits_media.variant_slug,
  new_02_planning_kits_media.support,
  new_02_planning_kits_media.canal,
  new_02_planning_kits_media.type,
  new_02_planning_kits_media.date,
  new_02_planning_kits_media.periodicite,
  new_02_planning_kits_media.specs_techniques,
  new_02_planning_kits_media.notes,
  new_02_planning_kits_media.texte_vectorise,
  1 - (new_02_planning_kits_media.embedding <=> query_embedding) AS similarity
FROM new_02_planning_kits_media
WHERE
  new_02_planning_kits_media.embedding IS NOT NULL
  AND 1 - (new_02_planning_kits_media.embedding <=> query_embedding) > match_threshold
  AND (org_id IS NULL OR new_02_planning_kits_media.organization_id = org_id)
ORDER BY new_02_planning_kits_media.embedding <=> query_embedding
LIMIT match_count;
END;
$$;

-- ============================================================
-- 4. match_visuels
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_visuels(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 10,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, variant_slug text, support text, canal text,
  type_de_format text, notes text, texte_vectorise text,
  similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
SELECT
  new_03_visuels.id,
  new_03_visuels.variant_slug,
  new_03_visuels.support,
  new_03_visuels.canal,
  new_03_visuels.type_de_format,
  new_03_visuels.notes,
  new_03_visuels.texte_vectorise,
  1 - (new_03_visuels.embedding <=> query_embedding) AS similarity
FROM new_03_visuels
WHERE
  new_03_visuels.embedding IS NOT NULL
  AND 1 - (new_03_visuels.embedding <=> query_embedding) > match_threshold
  AND (org_id IS NULL OR new_03_visuels.organization_id = org_id)
ORDER BY new_03_visuels.embedding <=> query_embedding
LIMIT match_count;
END;
$$;

-- ============================================================
-- 5. match_contacts
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_contacts(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 10,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, support text, nom text, prenom text,
  role text, notes text, texte_vectorise text,
  similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
SELECT
  new_04_contacts.id,
  new_04_contacts.support,
  new_04_contacts.nom,
  new_04_contacts.prenom,
  new_04_contacts.role,
  new_04_contacts.notes,
  new_04_contacts.texte_vectorise,
  1 - (new_04_contacts.embedding <=> query_embedding) AS similarity
FROM new_04_contacts
WHERE
  new_04_contacts.embedding IS NOT NULL
  AND 1 - (new_04_contacts.embedding <=> query_embedding) > match_threshold
  AND (org_id IS NULL OR new_04_contacts.organization_id = org_id)
ORDER BY new_04_contacts.embedding <=> query_embedding
LIMIT match_count;
END;
$$;

-- ============================================================
-- 6. match_supports_by_target
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_supports_by_target(
  query_embedding public.vector,
  brief_context text DEFAULT '',
  target_category text DEFAULT '',
  match_count integer DEFAULT 10,
  similarity_threshold double precision DEFAULT 0.3,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  variant_slug text, support text, support_slug text, canal text,
  periodicite_print text, diffusion_print integer, format_print text,
  visites_par_mois_web integer, pages_vues_par_mois_web integer,
  nombre_envois_nl integer, tarif_brut text, tarif_net text,
  categorie text, lectorat text, planning_data jsonb,
  visuels_data jsonb, contacts_data jsonb,
  similarity double precision, semantic_boost double precision,
  boosted_score double precision, threshold_used double precision,
  target_match_score double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
WITH base_search AS (
  SELECT
    v.variant_slug, v.support, v.support_slug, v.canal,
    v.periodicite_print, v.diffusion_print, v.format_print,
    v.visites_par_mois_web, v.pages_vues_par_mois_web,
    v.nombre_envois_nl, v.tarif_brut, v.tarif_net,
    m.categorie, m.lectorat,
    1 - (v.embedding <=> query_embedding) AS sim_score,
    CASE
      WHEN COALESCE(brief_context, '') != '' THEN
        get_semantic_boost(brief_context, COALESCE(m.categorie, ''), COALESCE(v.canal, ''))::float
      ELSE 1.0::float
    END AS boost,
    CASE
      WHEN target_category = '' OR target_category IS NULL THEN 1.0::float
      WHEN validate_support_target_match(m.categorie, m.lectorat, target_category) THEN 1.0::float
      ELSE 0.3::float
    END AS target_score
  FROM new_01_supports_variants v
  LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
  WHERE v.embedding IS NOT NULL
    AND 1 - (v.embedding <=> query_embedding) > similarity_threshold
    AND (org_id IS NULL OR v.organization_id = org_id)
),
filtered_results AS (
  SELECT *, (sim_score * boost * target_score) AS final_score
  FROM base_search
  WHERE target_score >= 0.9
  ORDER BY final_score DESC
  LIMIT match_count
),
enriched_results AS (
  SELECT
    fr.*,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', p.type, 'date', p.date_supabase,
        'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques,
        'notes', p.notes
      ) ORDER BY p.date_supabase)
      FROM new_02_planning_kits_media p
      WHERE p.variant_slug = fr.variant_slug
        AND (org_id IS NULL OR p.organization_id = org_id)
    ), '[]'::jsonb) AS planning_data,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url,
        'type_de_format', visu.type_de_format, 'notes', visu.notes
      ))
      FROM new_03_visuels visu
      WHERE visu.variant_slug = fr.variant_slug
        AND (org_id IS NULL OR visu.organization_id = org_id)
    ), '[]'::jsonb) AS visuels_data,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nom', c.nom, 'prenom', c.prenom, 'email', c.email,
        'telephone', c.telephone, 'role', c.role, 'notes', c.notes
      ))
      FROM new_04_contacts c
      WHERE c.variant_slug = fr.variant_slug
        AND (org_id IS NULL OR c.organization_id = org_id)
    ), '[]'::jsonb) AS contacts_data
  FROM filtered_results fr
)
SELECT
  er.variant_slug, er.support, er.support_slug, er.canal,
  er.periodicite_print, er.diffusion_print, er.format_print,
  er.visites_par_mois_web, er.pages_vues_par_mois_web,
  er.nombre_envois_nl, er.tarif_brut, er.tarif_net,
  er.categorie, er.lectorat,
  er.planning_data, er.visuels_data, er.contacts_data,
  er.sim_score AS similarity,
  er.boost AS semantic_boost,
  er.final_score AS boosted_score,
  similarity_threshold::float AS threshold_used,
  er.target_score AS target_match_score
FROM enriched_results er
ORDER BY er.final_score DESC;
END;
$$;

-- ============================================================
-- 7. match_supports_enriched
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_supports_enriched(
  query_embedding public.vector,
  match_count integer DEFAULT 20,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  variant_slug text, support text, support_slug text, canal text,
  periodicite_print text, diffusion_print integer, format_print text,
  visites_par_mois_web integer, pages_vues_par_mois_web integer,
  nombre_envois_nl integer, tarif_brut text, tarif_net text,
  categorie text, lectorat text, planning_data jsonb,
  visuels_data jsonb, contacts_data jsonb,
  similarity double precision, threshold_used double precision
)
LANGUAGE plpgsql AS $$
DECLARE
  result_count int;
  current_threshold float;
BEGIN
-- Threshold 0.4 (excellente qualité)
current_threshold := 0.4;

RETURN QUERY
WITH search_results AS (
  SELECT
    v.variant_slug, v.support, v.support_slug, v.canal,
    v.periodicite_print, v.diffusion_print, v.format_print,
    v.visites_par_mois_web, v.pages_vues_par_mois_web,
    v.nombre_envois_nl, v.tarif_brut, v.tarif_net,
    m.categorie, m.lectorat,
    1 - (v.embedding <=> query_embedding) AS sim_score
  FROM new_01_supports_variants v
  LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
  WHERE v.embedding IS NOT NULL
    AND 1 - (v.embedding <=> query_embedding) > current_threshold
    AND (org_id IS NULL OR v.organization_id = org_id)
  ORDER BY v.embedding <=> query_embedding
  LIMIT match_count
),
enriched_results AS (
  SELECT
    sr.*,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', p.type, 'date', p.date_supabase, 'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques, 'notes', p.notes))
      FROM new_02_planning_kits_media p WHERE p.variant_slug = sr.variant_slug AND (org_id IS NULL OR p.organization_id = org_id)
    ), '[]'::jsonb) AS planning_data,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url, 'type_de_format', visu.type_de_format, 'notes', visu.notes))
      FROM new_03_visuels visu WHERE visu.variant_slug = sr.variant_slug AND (org_id IS NULL OR visu.organization_id = org_id)
    ), '[]'::jsonb) AS visuels_data,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('nom', c.nom, 'prenom', c.prenom, 'email', c.email, 'telephone', c.telephone, 'role', c.role, 'notes', c.notes))
      FROM new_04_contacts c WHERE c.variant_slug = sr.variant_slug AND (org_id IS NULL OR c.organization_id = org_id)
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
  er.sim_score AS similarity,
  current_threshold AS threshold_used
FROM enriched_results er;

GET DIAGNOSTICS result_count = ROW_COUNT;

IF result_count < match_count / 2 THEN
  current_threshold := 0.25;
  RETURN QUERY
  WITH search_results AS (
    SELECT
      v.variant_slug, v.support, v.support_slug, v.canal,
      v.periodicite_print, v.diffusion_print, v.format_print,
      v.visites_par_mois_web, v.pages_vues_par_mois_web,
      v.nombre_envois_nl, v.tarif_brut, v.tarif_net,
      m.categorie, m.lectorat,
      1 - (v.embedding <=> query_embedding) AS sim_score
    FROM new_01_supports_variants v
    LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
    WHERE v.embedding IS NOT NULL
      AND 1 - (v.embedding <=> query_embedding) > current_threshold
      AND (org_id IS NULL OR v.organization_id = org_id)
    ORDER BY v.embedding <=> query_embedding
    LIMIT match_count
  ),
  enriched_results AS (
    SELECT sr.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('type', p.type, 'date', p.date_supabase, 'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques, 'notes', p.notes)) FROM new_02_planning_kits_media p WHERE p.variant_slug = sr.variant_slug AND (org_id IS NULL OR p.organization_id = org_id)), '[]'::jsonb) AS planning_data,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url, 'type_de_format', visu.type_de_format, 'notes', visu.notes)) FROM new_03_visuels visu WHERE visu.variant_slug = sr.variant_slug AND (org_id IS NULL OR visu.organization_id = org_id)), '[]'::jsonb) AS visuels_data,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('nom', c.nom, 'prenom', c.prenom, 'email', c.email, 'telephone', c.telephone, 'role', c.role, 'notes', c.notes)) FROM new_04_contacts c WHERE c.variant_slug = sr.variant_slug AND (org_id IS NULL OR c.organization_id = org_id)), '[]'::jsonb) AS contacts_data
    FROM search_results sr
  )
  SELECT er.variant_slug, er.support, er.support_slug, er.canal, er.periodicite_print, er.diffusion_print, er.format_print, er.visites_par_mois_web, er.pages_vues_par_mois_web, er.nombre_envois_nl, er.tarif_brut, er.tarif_net, er.categorie, er.lectorat, er.planning_data, er.visuels_data, er.contacts_data, er.sim_score AS similarity, current_threshold AS threshold_used
  FROM enriched_results er;
  GET DIAGNOSTICS result_count = ROW_COUNT;
END IF;

IF result_count < match_count / 3 THEN
  current_threshold := 0.15;
  RETURN QUERY
  WITH search_results AS (
    SELECT
      v.variant_slug, v.support, v.support_slug, v.canal,
      v.periodicite_print, v.diffusion_print, v.format_print,
      v.visites_par_mois_web, v.pages_vues_par_mois_web,
      v.nombre_envois_nl, v.tarif_brut, v.tarif_net,
      m.categorie, m.lectorat,
      1 - (v.embedding <=> query_embedding) AS sim_score
    FROM new_01_supports_variants v
    LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
    WHERE v.embedding IS NOT NULL
      AND 1 - (v.embedding <=> query_embedding) > current_threshold
      AND (org_id IS NULL OR v.organization_id = org_id)
    ORDER BY v.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  enriched_results AS (
    SELECT sr.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('type', p.type, 'date', p.date_supabase, 'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques, 'notes', p.notes)) FROM new_02_planning_kits_media p WHERE p.variant_slug = sr.variant_slug AND (org_id IS NULL OR p.organization_id = org_id)), '[]'::jsonb) AS planning_data,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url, 'type_de_format', visu.type_de_format, 'notes', visu.notes)) FROM new_03_visuels visu WHERE visu.variant_slug = sr.variant_slug AND (org_id IS NULL OR visu.organization_id = org_id)), '[]'::jsonb) AS visuels_data,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('nom', c.nom, 'prenom', c.prenom, 'email', c.email, 'telephone', c.telephone, 'role', c.role, 'notes', c.notes)) FROM new_04_contacts c WHERE c.variant_slug = sr.variant_slug AND (org_id IS NULL OR c.organization_id = org_id)), '[]'::jsonb) AS contacts_data
    FROM search_results sr
  )
  SELECT er.variant_slug, er.support, er.support_slug, er.canal, er.periodicite_print, er.diffusion_print, er.format_print, er.visites_par_mois_web, er.pages_vues_par_mois_web, er.nombre_envois_nl, er.tarif_brut, er.tarif_net, er.categorie, er.lectorat, er.planning_data, er.visuels_data, er.contacts_data, er.sim_score AS similarity, current_threshold AS threshold_used
  FROM enriched_results er
  LIMIT match_count;
END IF;
END;
$$;

-- ============================================================
-- 8. match_all_tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_all_tables(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.5,
  match_count_per_table integer DEFAULT 5,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  source_table text, record_id text, support text,
  canal text, content_preview text, similarity double precision
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
(
  SELECT 'supports_master'::text, sm.support_slug, sm.support, sm.canal,
    SUBSTRING(sm.texte_vectorise, 1, 200), 1 - (sm.embedding <=> query_embedding) AS similarity
  FROM new_00_supports_master sm
  WHERE sm.embedding IS NOT NULL
    AND 1 - (sm.embedding <=> query_embedding) > match_threshold
    AND (org_id IS NULL OR sm.organization_id = org_id)
  ORDER BY sm.embedding <=> query_embedding
  LIMIT match_count_per_table
)
UNION ALL
(
  SELECT 'supports_variants'::text, sv.variant_slug, sv.support, sv.canal,
    SUBSTRING(sv.texte_vectorise, 1, 200), 1 - (sv.embedding <=> query_embedding)
  FROM new_01_supports_variants sv
  WHERE sv.embedding IS NOT NULL
    AND 1 - (sv.embedding <=> query_embedding) > match_threshold
    AND (org_id IS NULL OR sv.organization_id = org_id)
  ORDER BY sv.embedding <=> query_embedding
  LIMIT match_count_per_table
)
UNION ALL
(
  SELECT 'planning_kits'::text, pk.id::text, pk.support, pk.canal,
    SUBSTRING(pk.texte_vectorise, 1, 200), 1 - (pk.embedding <=> query_embedding)
  FROM new_02_planning_kits_media pk
  WHERE pk.embedding IS NOT NULL
    AND 1 - (pk.embedding <=> query_embedding) > match_threshold
    AND (org_id IS NULL OR pk.organization_id = org_id)
  ORDER BY pk.embedding <=> query_embedding
  LIMIT match_count_per_table
)
UNION ALL
(
  SELECT 'visuels'::text, vis.id::text, vis.support, vis.canal,
    SUBSTRING(vis.texte_vectorise, 1, 200), 1 - (vis.embedding <=> query_embedding)
  FROM new_03_visuels vis
  WHERE vis.embedding IS NOT NULL
    AND 1 - (vis.embedding <=> query_embedding) > match_threshold
    AND (org_id IS NULL OR vis.organization_id = org_id)
  ORDER BY vis.embedding <=> query_embedding
  LIMIT match_count_per_table
)
UNION ALL
(
  SELECT 'contacts'::text, c.id::text, c.support, ''::text,
    SUBSTRING(c.texte_vectorise, 1, 200), 1 - (c.embedding <=> query_embedding)
  FROM new_04_contacts c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
    AND (org_id IS NULL OR c.organization_id = org_id)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count_per_table
)
ORDER BY similarity DESC;
END;
$$;

-- ============================================================
-- 9. match_supports_pure_vector_open
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_supports_pure_vector_open(
  query_embedding public.vector,
  match_threshold double precision DEFAULT 0.25,
  match_count integer DEFAULT 50,
  fallback_mode boolean DEFAULT true,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  support text, support_slug text, categorie text, lectorat text,
  canal text, similarity_score double precision,
  match_source text, confidence_level text
)
LANGUAGE plpgsql AS $$
DECLARE
  result_count integer := 0;
  current_threshold float;
  results_temp_count integer;
BEGIN
current_threshold := match_threshold;

CREATE TEMP TABLE temp_results (
  support text, support_slug text, categorie text, lectorat text,
  canal text, similarity_score float, match_source text, confidence_level text
) ON COMMIT DROP;

INSERT INTO temp_results
SELECT sm.support, sm.support_slug, sm.categorie, sm.lectorat, sm.canal,
  (1 - (sm.embedding <=> query_embedding))::float,
  'Master Support',
  CASE
    WHEN (1 - (sm.embedding <=> query_embedding)) >= 0.25 THEN 'Haute'
    WHEN (1 - (sm.embedding <=> query_embedding)) >= 0.20 THEN 'Moyenne'
    WHEN (1 - (sm.embedding <=> query_embedding)) >= 0.15 THEN 'Base'
    ELSE 'Faible'
  END
FROM new_00_supports_master sm
WHERE sm.embedding IS NOT NULL
  AND (1 - (sm.embedding <=> query_embedding)) >= current_threshold
  AND (org_id IS NULL OR sm.organization_id = org_id)
ORDER BY (1 - (sm.embedding <=> query_embedding)) DESC
LIMIT match_count;

GET DIAGNOSTICS results_temp_count = ROW_COUNT;
result_count := results_temp_count;

IF result_count < 5 AND fallback_mode THEN
  current_threshold := 0.20;
  INSERT INTO temp_results
  SELECT sm.support, sm.support_slug, sm.categorie, sm.lectorat, sm.canal,
    (1 - (sm.embedding <=> query_embedding))::float,
    'Master Support (Fallback 0.20)', 'Moyenne (Fallback)'
  FROM new_00_supports_master sm
  WHERE sm.embedding IS NOT NULL
    AND (1 - (sm.embedding <=> query_embedding)) >= current_threshold
    AND (1 - (sm.embedding <=> query_embedding)) < match_threshold
    AND (org_id IS NULL OR sm.organization_id = org_id)
    AND NOT EXISTS (SELECT 1 FROM temp_results tr WHERE tr.support_slug = sm.support_slug)
  ORDER BY (1 - (sm.embedding <=> query_embedding)) DESC
  LIMIT (match_count - result_count);
  GET DIAGNOSTICS results_temp_count = ROW_COUNT;
  result_count := result_count + results_temp_count;
END IF;

IF result_count < 5 AND fallback_mode THEN
  current_threshold := 0.15;
  INSERT INTO temp_results
  SELECT sm.support, sm.support_slug, sm.categorie, sm.lectorat, sm.canal,
    (1 - (sm.embedding <=> query_embedding))::float,
    'Master Support (Fallback 0.15)', 'Faible (Wide Search)'
  FROM new_00_supports_master sm
  WHERE sm.embedding IS NOT NULL
    AND (1 - (sm.embedding <=> query_embedding)) >= current_threshold
    AND (1 - (sm.embedding <=> query_embedding)) < 0.20
    AND (org_id IS NULL OR sm.organization_id = org_id)
    AND NOT EXISTS (SELECT 1 FROM temp_results tr WHERE tr.support_slug = sm.support_slug)
  ORDER BY (1 - (sm.embedding <=> query_embedding)) DESC
  LIMIT (match_count - result_count);
END IF;

RETURN QUERY
SELECT tr.support, tr.support_slug, tr.categorie, tr.lectorat, tr.canal,
  tr.similarity_score, tr.match_source, tr.confidence_level
FROM temp_results tr
ORDER BY tr.similarity_score DESC;

RETURN;
END;
$$;

-- ============================================================
-- 10. match_supports_zero_failure
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_supports_zero_failure(
  query_text text,
  query_embedding public.vector DEFAULT NULL,
  max_results integer DEFAULT 20,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  support text, canal text, categorie text, lectorat text,
  tarif_net text, diffusion_print integer, periodicite_print text,
  prochaine_parution text, variant_slug text,
  similarity double precision, fallback_level integer,
  fallback_explanation text
)
LANGUAGE plpgsql AS $$
DECLARE
  result_count integer := 0;
  expanded_synonyms text[];
  target_universe text;
BEGIN
-- LEVEL 1: Exact match on profession name
RETURN QUERY
SELECT sv.support, sv.canal, sv.categorie, sv.lectorat, sv.tarif_net,
  sv.diffusion_print, sv.periodicite_print, sv.prochaine_parution, sv.variant_slug,
  CASE WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
    THEN (1 - (sv.embedding <=> query_embedding))::float ELSE 0.0::float END,
  1, 'Match exact sur la cible'
FROM new_01_supports_variants sv
WHERE sv.categorie IS NOT NULL
  AND (LOWER(sv.categorie) LIKE '%' || LOWER(query_text) || '%' OR LOWER(sv.lectorat) LIKE '%' || LOWER(query_text) || '%')
  AND (org_id IS NULL OR sv.organization_id = org_id)
ORDER BY CASE WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL THEN sv.embedding <=> query_embedding ELSE 999 END
LIMIT max_results;

GET DIAGNOSTICS result_count = ROW_COUNT;
IF result_count >= 5 THEN RETURN; END IF;

-- LEVEL 2: Synonym search
expanded_synonyms := ARRAY(SELECT s.category FROM expand_target_with_synonyms(query_text) s);

IF array_length(expanded_synonyms, 1) > 0 THEN
  RETURN QUERY
  SELECT sv.support, sv.canal, sv.categorie, sv.lectorat, sv.tarif_net,
    sv.diffusion_print, sv.periodicite_print, sv.prochaine_parution, sv.variant_slug,
    CASE WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
      THEN (1 - (sv.embedding <=> query_embedding))::float ELSE 0.0::float END,
    2, 'Match via synonymes médicaux'
  FROM new_01_supports_variants sv
  WHERE sv.categorie = ANY(expanded_synonyms)
    AND (org_id IS NULL OR sv.organization_id = org_id)
  ORDER BY CASE WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL THEN sv.embedding <=> query_embedding ELSE 999 END
  LIMIT max_results;
  GET DIAGNOSTICS result_count = ROW_COUNT;
  IF result_count >= 5 THEN RETURN; END IF;
END IF;

-- LEVEL 3: Semantic universe search
SELECT s.universe INTO target_universe FROM expand_target_with_synonyms(query_text) s LIMIT 1;

IF target_universe IS NOT NULL THEN
  RETURN QUERY
  SELECT sv.support, sv.canal, sv.categorie, sv.lectorat, sv.tarif_net,
    sv.diffusion_print, sv.periodicite_print, sv.prochaine_parution, sv.variant_slug,
    CASE WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
      THEN (1 - (sv.embedding <=> query_embedding))::float ELSE 0.0::float END,
    3, format('Match dans l''univers "%s" (professions connexes)', target_universe)
  FROM new_01_supports_variants sv
  INNER JOIN medical_profession_synonyms s ON s.category = sv.categorie
  WHERE s.universe = target_universe
    AND (org_id IS NULL OR sv.organization_id = org_id)
  ORDER BY s.confidence_score DESC,
    CASE WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL THEN sv.embedding <=> query_embedding ELSE 999 END
  LIMIT max_results;
  GET DIAGNOSTICS result_count = ROW_COUNT;
  IF result_count >= 5 THEN RETURN; END IF;
END IF;

-- LEVEL 4: Broad semantic search
IF query_embedding IS NOT NULL THEN
  RETURN QUERY
  SELECT sv.support, sv.canal, sv.categorie, sv.lectorat, sv.tarif_net,
    sv.diffusion_print, sv.periodicite_print, sv.prochaine_parution, sv.variant_slug,
    (1 - (sv.embedding <=> query_embedding))::float, 4,
    'Match sémantique large sur le contenu du brief'
  FROM new_01_supports_variants sv
  WHERE sv.embedding IS NOT NULL
    AND (1 - (sv.embedding <=> query_embedding)) >= 0.15
    AND (org_id IS NULL OR sv.organization_id = org_id)
  ORDER BY sv.embedding <=> query_embedding
  LIMIT max_results;
  GET DIAGNOSTICS result_count = ROW_COUNT;
  IF result_count >= 5 THEN RETURN; END IF;
END IF;

-- LEVEL 5: Popular generalist supports
RETURN QUERY
SELECT sv.support, sv.canal, sv.categorie, sv.lectorat, sv.tarif_net,
  sv.diffusion_print, sv.periodicite_print, sv.prochaine_parution, sv.variant_slug,
  0.0::float, 5,
  'Supports généralistes à audience large (aucun match direct trouvé)'
FROM new_01_supports_variants sv
WHERE sv.diffusion_print IS NOT NULL AND sv.diffusion_print > 10000
  AND (org_id IS NULL OR sv.organization_id = org_id)
ORDER BY sv.diffusion_print DESC NULLS LAST
LIMIT max_results;

RETURN;
END;
$$;

-- ============================================================
-- 11. detect_targets_from_vector_search
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_targets_from_vector_search(
  query_embedding public.vector,
  brief_context text DEFAULT '',
  max_results integer DEFAULT 150,
  match_threshold double precision DEFAULT 0.35,
  top_categories integer DEFAULT 20,
  org_id uuid DEFAULT NULL
)
RETURNS TABLE(
  target_name text, target_category text,
  avg_similarity double precision, support_count integer,
  top_support text
)
LANGUAGE plpgsql AS $$
BEGIN
RETURN QUERY
WITH raw_matches AS (
  SELECT m.categorie, v.support, 1 - (v.embedding <=> query_embedding) AS similarity
  FROM new_01_supports_variants v
  LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
  WHERE v.embedding IS NOT NULL
    AND 1 - (v.embedding <=> query_embedding) > match_threshold
    AND m.categorie IS NOT NULL
    AND (org_id IS NULL OR v.organization_id = org_id)
  ORDER BY similarity DESC
  LIMIT max_results
),
category_aggregates AS (
  SELECT categorie, AVG(similarity) AS avg_sim, COUNT(*) AS support_cnt, MAX(support) AS top_sup
  FROM raw_matches
  GROUP BY categorie
  HAVING COUNT(*) >= 2
  ORDER BY avg_sim DESC
  LIMIT top_categories
)
SELECT ca.categorie, ca.categorie, ca.avg_sim::float, ca.support_cnt::int, ca.top_sup
FROM category_aggregates ca;
END;
$$;

-- ============================================================
-- 12-14: extract_targets_from_brief, expand_target_with_synonyms, get_semantic_boost
-- These don't query org-scoped tables directly, no changes needed.
-- extract_targets_from_brief uses profession_to_category_mappings (global reference data)
-- expand_target_with_synonyms uses medical_profession_synonyms (global reference data)
-- get_semantic_boost uses semantic_mappings (global reference data)
-- ============================================================

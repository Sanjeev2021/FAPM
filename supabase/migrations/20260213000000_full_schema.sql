--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: detect_targets_from_vector_search(public.vector, text, integer, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detect_targets_from_vector_search(query_embedding public.vector, brief_context text DEFAULT ''::text, max_results integer DEFAULT 150, match_threshold double precision DEFAULT 0.35, top_categories integer DEFAULT 20) RETURNS TABLE(target_name text, target_category text, avg_similarity double precision, support_count integer, top_support text)
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY
WITH raw_matches AS (
SELECT
m.categorie,
v.support,
1 - (v.embedding <=> query_embedding) AS similarity
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > match_threshold
AND m.categorie IS NOT NULL
ORDER BY similarity DESC
LIMIT max_results
),
category_aggregates AS (
SELECT
categorie,
AVG(similarity) AS avg_sim,
COUNT(*) AS support_cnt,
MAX(support) AS top_sup
FROM raw_matches
GROUP BY categorie
HAVING COUNT(*) >= 2  -- Minimum 2 supports per category to avoid noise
ORDER BY avg_sim DESC
LIMIT top_categories
)
SELECT
ca.categorie AS target_name,
ca.categorie AS target_category,
ca.avg_sim::float AS avg_similarity,
ca.support_cnt::int AS support_count,
ca.top_sup AS top_support
FROM category_aggregates ca;
END;
$$;


--
-- Name: FUNCTION detect_targets_from_vector_search(query_embedding public.vector, brief_context text, max_results integer, match_threshold double precision, top_categories integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.detect_targets_from_vector_search(query_embedding public.vector, brief_context text, max_results integer, match_threshold double precision, top_categories integer) IS 'Detects target categories using vector similarity with increased limits.
Returns top 20 categories from top 150 matching supports.
Threshold lowered to 0.35 for better recall of rare categories.';


--
-- Name: expand_target_with_synonyms(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expand_target_with_synonyms(input_target text) RETURNS TABLE(canonical_name text, matched_synonym text, category text, universe text, confidence integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY
SELECT DISTINCT
s.canonical_name,
s.synonym AS matched_synonym,
s.category,
s.universe,
s.confidence_score
FROM medical_profession_synonyms s
WHERE
LOWER(s.synonym) = LOWER(input_target)
OR LOWER(s.canonical_name) = LOWER(input_target)
OR LOWER(input_target) LIKE '%' || LOWER(s.synonym) || '%'
OR LOWER(s.synonym) LIKE '%' || LOWER(input_target) || '%'
ORDER BY s.confidence_score DESC;
END;
$$;


--
-- Name: extract_targets_from_brief(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extract_targets_from_brief(brief_text text) RETURNS TABLE(target_name text, target_category text, boost_score double precision, keywords_matched text[])
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
brief_lower text;
brief_normalized text;
BEGIN
IF brief_text IS NULL OR TRIM(brief_text) = '' THEN
RETURN;
END IF;

brief_lower := lower(brief_text);

-- Normalisation du brief
brief_normalized := translate(brief_lower, '''`´''"', '       ');
brief_normalized := regexp_replace(brief_normalized, '[^a-z0-9 ]+', ' ', 'g');
brief_normalized := regexp_replace(' ' || TRIM(brief_normalized) || ' ', '\s+[a-z]\s+', ' ', 'g');
brief_normalized := regexp_replace(TRIM(brief_normalized), '\s+', ' ', 'g');
brief_normalized := ' ' || brief_normalized || ' ';
brief_lower := ' ' || brief_lower || ' ';

RETURN QUERY
WITH keyword_matches AS (
SELECT DISTINCT
pm.exact_category_name,
pm.profession_keyword,
CASE
WHEN pm.priority_level = 'high' THEN 1.5
WHEN pm.priority_level = 'medium' THEN 1.2
ELSE 1.0
END AS boost,
length(pm.profession_keyword) AS match_length
FROM profession_to_category_mappings pm
WHERE
-- Match sur keyword normalisé - TRIM le pattern !
brief_normalized ~ ('(^|[[:space:]])' || TRIM(
regexp_replace(
regexp_replace(
' ' || regexp_replace(
regexp_replace(
translate(lower(pm.profession_keyword), '''`´''"', '       '),
'[^a-z0-9 ]+', ' ', 'g'
),
'[^a-z0-9 ]+', ' ', 'g'
) || ' ',
'\s+[a-z]\s+', ' ', 'g'
),
'\s+', ' ', 'g'
)
) || '([[:space:]]|$)')
-- OU match sur keyword original
OR brief_lower ~ ('(^|[[:space:]])' || lower(pm.profession_keyword) || '([[:space:]]|$)')
-- OU match sur synonymes normalisés - TRIM le pattern !
OR EXISTS (
SELECT 1 FROM unnest(pm.synonyms) AS syn
WHERE brief_normalized ~ ('(^|[[:space:]])' || TRIM(
regexp_replace(
regexp_replace(
' ' || regexp_replace(
regexp_replace(
translate(lower(syn), '''`´''"', '       '),
'[^a-z0-9 ]+', ' ', 'g'
),
'[^a-z0-9 ]+', ' ', 'g'
) || ' ',
'\s+[a-z]\s+', ' ', 'g'
),
'\s+', ' ', 'g'
)
) || '([[:space:]]|$)')
OR brief_lower ~ ('(^|[[:space:]])' || lower(syn) || '([[:space:]]|$)')
)
),
ranked_matches AS (
SELECT
km.exact_category_name,
km.profession_keyword,
km.boost,
km.match_length,
CASE
WHEN km.exact_category_name IN ('Collectivités', 'Médecins', 'Pharmaciens', 'Infirmiers', 'Dirigeants', 'decideurs')
THEN true
ELSE false
END AS is_generic,
CASE
WHEN km.exact_category_name LIKE '%locales%'
OR km.exact_category_name LIKE '%généralistes%'
OR km.exact_category_name LIKE '%d''officine%'
OR km.exact_category_name LIKE '%libéraux%'
OR km.exact_category_name LIKE '%TPE%'
OR km.exact_category_name LIKE '%PME%'
THEN true
ELSE false
END AS is_specific
FROM keyword_matches km
WHERE km.match_length > 0
),
filtered_matches AS (
SELECT
rm1.exact_category_name,
rm1.profession_keyword,
rm1.boost
FROM ranked_matches rm1
WHERE
NOT rm1.is_generic
OR (
rm1.is_generic
AND NOT EXISTS (
SELECT 1 FROM ranked_matches rm2
WHERE rm2.is_specific
AND (
(rm1.exact_category_name = 'Collectivités' AND rm2.exact_category_name LIKE '%Collectivités%')
OR (rm1.exact_category_name = 'Médecins' AND rm2.exact_category_name LIKE '%Médecins%')
OR (rm1.exact_category_name = 'Pharmaciens' AND rm2.exact_category_name LIKE '%Pharmaciens%')
OR (rm1.exact_category_name = 'Infirmiers' AND rm2.exact_category_name LIKE '%Infirmiers%')
OR (rm1.exact_category_name IN ('Dirigeants', 'decideurs') AND rm2.exact_category_name LIKE '%Dirigeants%')
)
)
)
)
SELECT
fm.exact_category_name AS target_name,
fm.exact_category_name AS target_category,
MAX(fm.boost)::float AS boost_score,
array_agg(DISTINCT fm.profession_keyword) AS keywords_matched
FROM filtered_matches fm
GROUP BY fm.exact_category_name
ORDER BY MAX(fm.boost) DESC, fm.exact_category_name;
END;
$_$;


--
-- Name: FUNCTION extract_targets_from_brief(brief_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.extract_targets_from_brief(brief_text text) IS 'Phase 1: Extraction complète avec TRIM sur patterns pour éviter espaces parasites';


--
-- Name: get_semantic_boost(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_semantic_boost(brief_text text, support_categorie text, support_canal text) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
boost numeric := 1.0;
max_boost numeric := 1.0;
mapping record;
BEGIN
-- ✅ Early return si pas de contexte
IF brief_text IS NULL OR TRIM(brief_text) = '' THEN
RETURN 1.0;
END IF;

-- Recherche des mappings pertinents
FOR mapping IN
SELECT * FROM semantic_mappings
WHERE lower(brief_text) LIKE '%' || lower(keyword) || '%'
ORDER BY priority_level DESC, boost_score DESC
LOOP
-- Match catégorie
IF mapping.target_categorie IS NULL OR
lower(COALESCE(support_categorie, '')) LIKE '%' || lower(mapping.target_categorie) || '%' THEN

-- Match canal
IF mapping.target_canal IS NULL OR
lower(COALESCE(support_canal, '')) LIKE '%' || lower(mapping.target_canal) || '%' OR
lower(mapping.target_canal) LIKE '%' || lower(COALESCE(support_canal, '')) || '%' THEN

IF mapping.boost_score > max_boost THEN
max_boost := mapping.boost_score;
END IF;
END IF;
END IF;
END LOOP;

RETURN max_boost;
END;
$$;


--
-- Name: FUNCTION get_semantic_boost(brief_text text, support_categorie text, support_canal text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_semantic_boost(brief_text text, support_categorie text, support_canal text) IS 'Calcule le boost sémantique basé sur le brief utilisateur.
Retourne toujours 1.0 si brief vide (pas d''erreur).
Recherche insensible à la casse dans semantic_mappings.';


--
-- Name: match_all_tables(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_all_tables(query_embedding public.vector, match_threshold double precision DEFAULT 0.5, match_count_per_table integer DEFAULT 5) RETURNS TABLE(source_table text, record_id text, support text, canal text, content_preview text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY
(
-- Supports Master
SELECT
'supports_master'::text AS source_table,
sm.support_slug AS record_id,
sm.support,
sm.canal,
SUBSTRING(sm.texte_vectorise, 1, 200) AS content_preview,
1 - (sm.embedding <=> query_embedding) AS similarity
FROM new_00_supports_master sm
WHERE 
sm.embedding IS NOT NULL
AND 1 - (sm.embedding <=> query_embedding) > match_threshold
ORDER BY sm.embedding <=> query_embedding
LIMIT match_count_per_table
)
UNION ALL
(
-- Supports Variants
SELECT
'supports_variants'::text AS source_table,
sv.variant_slug AS record_id,
sv.support,
sv.canal,
SUBSTRING(sv.texte_vectorise, 1, 200) AS content_preview,
1 - (sv.embedding <=> query_embedding) AS similarity
FROM new_01_supports_variants sv
WHERE 
sv.embedding IS NOT NULL
AND 1 - (sv.embedding <=> query_embedding) > match_threshold
ORDER BY sv.embedding <=> query_embedding
LIMIT match_count_per_table
)
UNION ALL
(
-- Planning Kits
SELECT
'planning_kits'::text AS source_table,
pk.id::text AS record_id,
pk.support,
pk.canal,
SUBSTRING(pk.texte_vectorise, 1, 200) AS content_preview,
1 - (pk.embedding <=> query_embedding) AS similarity
FROM new_02_planning_kits_media pk
WHERE 
pk.embedding IS NOT NULL
AND 1 - (pk.embedding <=> query_embedding) > match_threshold
ORDER BY pk.embedding <=> query_embedding
LIMIT match_count_per_table
)
UNION ALL
(
-- Visuels
SELECT
'visuels'::text AS source_table,
v.id::text AS record_id,
v.support,
v.canal,
SUBSTRING(v.texte_vectorise, 1, 200) AS content_preview,
1 - (v.embedding <=> query_embedding) AS similarity
FROM new_03_visuels v
WHERE 
v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > match_threshold
ORDER BY v.embedding <=> query_embedding
LIMIT match_count_per_table
)
UNION ALL
(
-- Contacts
SELECT
'contacts'::text AS source_table,
c.id::text AS record_id,
c.support,
''::text AS canal,
SUBSTRING(c.texte_vectorise, 1, 200) AS content_preview,
1 - (c.embedding <=> query_embedding) AS similarity
FROM new_04_contacts c
WHERE 
c.embedding IS NOT NULL
AND 1 - (c.embedding <=> query_embedding) > match_threshold
ORDER BY c.embedding <=> query_embedding
LIMIT match_count_per_table
)
ORDER BY similarity DESC;
END;
$$;


--
-- Name: match_contacts(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_contacts(query_embedding public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 10) RETURNS TABLE(id uuid, support text, nom text, prenom text, role text, notes text, texte_vectorise text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
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
ORDER BY new_04_contacts.embedding <=> query_embedding
LIMIT match_count;
END;
$$;


--
-- Name: match_planning_kits(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_planning_kits(query_embedding public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 10) RETURNS TABLE(id uuid, variant_slug text, support text, canal text, type text, date text, periodicite text, specs_techniques text, notes text, texte_vectorise text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
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
ORDER BY new_02_planning_kits_media.embedding <=> query_embedding
LIMIT match_count;
END;
$$;


--
-- Name: match_supports_by_target(public.vector, text, text, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_supports_by_target(query_embedding public.vector, brief_context text DEFAULT ''::text, target_category text DEFAULT ''::text, match_count integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.3) RETURNS TABLE(variant_slug text, support text, support_slug text, canal text, periodicite_print text, diffusion_print integer, format_print text, visites_par_mois_web integer, pages_vues_par_mois_web integer, nombre_envois_nl integer, tarif_brut text, tarif_net text, categorie text, lectorat text, planning_data jsonb, visuels_data jsonb, contacts_data jsonb, similarity double precision, semantic_boost double precision, boosted_score double precision, threshold_used double precision, target_match_score double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY
WITH base_search AS (
SELECT
v.variant_slug,
v.support,
v.support_slug,
v.canal,
v.periodicite_print,
v.diffusion_print,
v.format_print,
v.visites_par_mois_web,
v.pages_vues_par_mois_web,
v.nombre_envois_nl,
v.tarif_brut,
v.tarif_net,
m.categorie,
m.lectorat,
1 - (v.embedding <=> query_embedding) AS sim_score,
CASE
WHEN COALESCE(brief_context, '') != '' THEN
get_semantic_boost(brief_context, COALESCE(m.categorie, ''), COALESCE(v.canal, ''))::float
ELSE 1.0::float
END AS boost,
-- Score de match avec la cible
CASE
WHEN target_category = '' OR target_category IS NULL THEN 1.0::float
WHEN validate_support_target_match(m.categorie, m.lectorat, target_category) THEN 1.0::float
ELSE 0.3::float  -- Pénalité si pas de match
END AS target_score
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > similarity_threshold  -- Use parameter
),
filtered_results AS (
SELECT
*,
(sim_score * boost * target_score) AS final_score
FROM base_search
WHERE target_score >= 0.9  -- Garder uniquement les vrais matchs
ORDER BY final_score DESC
LIMIT match_count
),
enriched_results AS (
SELECT
fr.*,
COALESCE(
(
SELECT jsonb_agg(
jsonb_build_object(
'type', p.type,
'date', p.date_supabase,
'periodicite', p.periodicite,
'specs_techniques', p.specs_techniques,
'notes', p.notes
) ORDER BY p.date_supabase
)
FROM new_02_planning_kits_media p
WHERE p.variant_slug = fr.variant_slug
),
'[]'::jsonb
) AS planning_data,
COALESCE(
(
SELECT jsonb_agg(
jsonb_build_object(
'fichier_integre', visu.fichier_integre,
'fichier_url', visu.fichier_url,
'type_de_format', visu.type_de_format,
'notes', visu.notes
)
)
FROM new_03_visuels visu
WHERE visu.variant_slug = fr.variant_slug
),
'[]'::jsonb
) AS visuels_data,
COALESCE(
(
SELECT jsonb_agg(
jsonb_build_object(
'nom', c.nom,
'prenom', c.prenom,
'email', c.email,
'telephone', c.telephone,
'role', c.role,
'notes', c.notes
)
)
FROM new_04_contacts c
WHERE c.variant_slug = fr.variant_slug
),
'[]'::jsonb
) AS contacts_data
FROM filtered_results fr
)
SELECT
er.variant_slug,
er.support,
er.support_slug,
er.canal,
er.periodicite_print,
er.diffusion_print,
er.format_print,
er.visites_par_mois_web,
er.pages_vues_par_mois_web,
er.nombre_envois_nl,
er.tarif_brut,
er.tarif_net,
er.categorie,
er.lectorat,
er.planning_data,
er.visuels_data,
er.contacts_data,
er.sim_score AS similarity,
er.boost AS semantic_boost,
er.final_score AS boosted_score,
similarity_threshold::float AS threshold_used,
er.target_score AS target_match_score
FROM enriched_results er
ORDER BY er.final_score DESC;
END;
$$;


--
-- Name: FUNCTION match_supports_by_target(query_embedding public.vector, brief_context text, target_category text, match_count integer, similarity_threshold double precision); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.match_supports_by_target(query_embedding public.vector, brief_context text, target_category text, match_count integer, similarity_threshold double precision) IS 'Recherche vectorielle avec filtrage strict par cible et seuil paramétrable.
Permet d''ajuster le threshold pour des recherches plus permissives en fallback.';


--
-- Name: match_supports_enriched(public.vector, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_supports_enriched(query_embedding public.vector, match_count integer DEFAULT 20) RETURNS TABLE(variant_slug text, support text, support_slug text, canal text, periodicite_print text, diffusion_print integer, format_print text, visites_par_mois_web integer, pages_vues_par_mois_web integer, nombre_envois_nl integer, tarif_brut text, tarif_net text, categorie text, lectorat text, planning_data jsonb, visuels_data jsonb, contacts_data jsonb, similarity double precision, threshold_used double precision)
    LANGUAGE plpgsql
    AS $$
DECLARE
result_count int;
current_threshold float;
BEGIN
-- Threshold 0.4 (excellente qualité)
current_threshold := 0.4;

RETURN QUERY
WITH search_results AS (
SELECT
v.variant_slug,
v.support,
v.support_slug,
v.canal,
v.periodicite_print,
v.diffusion_print,
v.format_print,
v.visites_par_mois_web,
v.pages_vues_par_mois_web,
v.nombre_envois_nl,
v.tarif_brut,
v.tarif_net,
m.categorie,
m.lectorat,
1 - (v.embedding <=> query_embedding) AS sim_score
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > current_threshold
ORDER BY v.embedding <=> query_embedding
LIMIT match_count
),
enriched_results AS (
SELECT
sr.*,
COALESCE(
(
SELECT jsonb_agg(
jsonb_build_object(
'type', p.type,
'date', p.date_supabase,
'periodicite', p.periodicite,
'specs_techniques', p.specs_techniques,
'notes', p.notes
)
)
FROM new_02_planning_kits_media p
WHERE p.variant_slug = sr.variant_slug
),
'[]'::jsonb
) AS planning_data,
COALESCE(
(
SELECT jsonb_agg(
jsonb_build_object(
'fichier_integre', visu.fichier_integre,
'fichier_url', visu.fichier_url,
'type_de_format', visu.type_de_format,
'notes', visu.notes
)
)
FROM new_03_visuels visu
WHERE visu.variant_slug = sr.variant_slug
),
'[]'::jsonb
) AS visuels_data,
COALESCE(
(
SELECT jsonb_agg(
jsonb_build_object(
'nom', c.nom,
'prenom', c.prenom,
'email', c.email,
'telephone', c.telephone,
'role', c.role,
'notes', c.notes
)
)
FROM new_04_contacts c
WHERE c.variant_slug = sr.variant_slug
),
'[]'::jsonb
) AS contacts_data
FROM search_results sr
)
SELECT 
er.variant_slug,
er.support,
er.support_slug,
er.canal,
er.periodicite_print,
er.diffusion_print,
er.format_print,
er.visites_par_mois_web,
er.pages_vues_par_mois_web,
er.nombre_envois_nl,
er.tarif_brut,
er.tarif_net,
er.categorie,
er.lectorat,
er.planning_data,
er.visuels_data,
er.contacts_data,
er.sim_score AS similarity,
current_threshold AS threshold_used
FROM enriched_results er;

GET DIAGNOSTICS result_count = ROW_COUNT;

IF result_count < match_count / 2 THEN
current_threshold := 0.25;

RETURN QUERY
WITH search_results AS (
SELECT
v.variant_slug,
v.support,
v.support_slug,
v.canal,
v.periodicite_print,
v.diffusion_print,
v.format_print,
v.visites_par_mois_web,
v.pages_vues_par_mois_web,
v.nombre_envois_nl,
v.tarif_brut,
v.tarif_net,
m.categorie,
m.lectorat,
1 - (v.embedding <=> query_embedding) AS sim_score
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > current_threshold
ORDER BY v.embedding <=> query_embedding
LIMIT match_count
),
enriched_results AS (
SELECT
sr.*,
COALESCE(
(SELECT jsonb_agg(jsonb_build_object('type', p.type, 'date', p.date_supabase, 'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques, 'notes', p.notes)) FROM new_02_planning_kits_media p WHERE p.variant_slug = sr.variant_slug),
'[]'::jsonb
) AS planning_data,
COALESCE(
(SELECT jsonb_agg(jsonb_build_object('fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url, 'type_de_format', visu.type_de_format, 'notes', visu.notes)) FROM new_03_visuels visu WHERE visu.variant_slug = sr.variant_slug),
'[]'::jsonb
) AS visuels_data,
COALESCE(
(SELECT jsonb_agg(jsonb_build_object('nom', c.nom, 'prenom', c.prenom, 'email', c.email, 'telephone', c.telephone, 'role', c.role, 'notes', c.notes)) FROM new_04_contacts c WHERE c.variant_slug = sr.variant_slug),
'[]'::jsonb
) AS contacts_data
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
v.variant_slug,
v.support,
v.support_slug,
v.canal,
v.periodicite_print,
v.diffusion_print,
v.format_print,
v.visites_par_mois_web,
v.pages_vues_par_mois_web,
v.nombre_envois_nl,
v.tarif_brut,
v.tarif_net,
m.categorie,
m.lectorat,
1 - (v.embedding <=> query_embedding) AS sim_score
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > current_threshold
ORDER BY v.embedding <=> query_embedding
LIMIT match_count * 2
),
enriched_results AS (
SELECT
sr.*,
COALESCE((SELECT jsonb_agg(jsonb_build_object('type', p.type, 'date', p.date_supabase, 'periodicite', p.periodicite, 'specs_techniques', p.specs_techniques, 'notes', p.notes)) FROM new_02_planning_kits_media p WHERE p.variant_slug = sr.variant_slug), '[]'::jsonb) AS planning_data,
COALESCE((SELECT jsonb_agg(jsonb_build_object('fichier_integre', visu.fichier_integre, 'fichier_url', visu.fichier_url, 'type_de_format', visu.type_de_format, 'notes', visu.notes)) FROM new_03_visuels visu WHERE visu.variant_slug = sr.variant_slug), '[]'::jsonb) AS visuels_data,
COALESCE((SELECT jsonb_agg(jsonb_build_object('nom', c.nom, 'prenom', c.prenom, 'email', c.email, 'telephone', c.telephone, 'role', c.role, 'notes', c.notes)) FROM new_04_contacts c WHERE c.variant_slug = sr.variant_slug), '[]'::jsonb) AS contacts_data
FROM search_results sr
)
SELECT er.variant_slug, er.support, er.support_slug, er.canal, er.periodicite_print, er.diffusion_print, er.format_print, er.visites_par_mois_web, er.pages_vues_par_mois_web, er.nombre_envois_nl, er.tarif_brut, er.tarif_net, er.categorie, er.lectorat, er.planning_data, er.visuels_data, er.contacts_data, er.sim_score AS similarity, current_threshold AS threshold_used
FROM enriched_results er
LIMIT match_count;
END IF;
END;
$$;


--
-- Name: FUNCTION match_supports_enriched(query_embedding public.vector, match_count integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.match_supports_enriched(query_embedding public.vector, match_count integer) IS 'Phase 1: Thresholds 0.4/0.25/0.15 pour exploiter PGVector pleinement';


--
-- Name: match_supports_master(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_supports_master(query_embedding public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 10) RETURNS TABLE(support_slug text, support text, categorie text, lectorat text, canal text, periodicite_print text, diffusion_print integer, format_print text, tarif_net text, tarif_brut text, texte_vectorise text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY
SELECT DISTINCT ON (m.support_slug)
m.support_slug,
m.support,
m.categorie,
m.lectorat,
m.canal,
v.periodicite_print,
v.diffusion_print,
v.format_print,
v.tarif_net,
v.tarif_brut,
m.texte_vectorise,
1 - (m.embedding <=> query_embedding) AS similarity
FROM new_00_supports_master m
LEFT JOIN new_01_supports_variants v ON m.support_slug = v.support_slug
WHERE m.embedding IS NOT NULL
AND 1 - (m.embedding <=> query_embedding) > match_threshold
ORDER BY m.support_slug, similarity DESC
LIMIT match_count;
END;
$$;


--
-- Name: match_supports_pure_vector_open(public.vector, double precision, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_supports_pure_vector_open(query_embedding public.vector, match_threshold double precision DEFAULT 0.25, match_count integer DEFAULT 50, fallback_mode boolean DEFAULT true) RETURNS TABLE(support text, support_slug text, categorie text, lectorat text, canal text, similarity_score double precision, match_source text, confidence_level text)
    LANGUAGE plpgsql
    AS $$
DECLARE
result_count integer := 0;
current_threshold float;
results_temp_count integer;
BEGIN
-- Étape 1: Recherche avec threshold initial (0.25)
current_threshold := match_threshold;

CREATE TEMP TABLE temp_results (
support text,
support_slug text,
categorie text,
lectorat text,
canal text,
similarity_score float,
match_source text,
confidence_level text
) ON COMMIT DROP;

-- Insertion des résultats avec threshold 0.25
INSERT INTO temp_results
SELECT
sm.support,
sm.support_slug,
sm.categorie,
sm.lectorat,
sm.canal,
(1 - (sm.embedding <=> query_embedding))::float as similarity_score,
'Master Support' as match_source,
CASE
WHEN (1 - (sm.embedding <=> query_embedding)) >= 0.25 THEN 'Haute'
WHEN (1 - (sm.embedding <=> query_embedding)) >= 0.20 THEN 'Moyenne'
WHEN (1 - (sm.embedding <=> query_embedding)) >= 0.15 THEN 'Base'
ELSE 'Faible'
END as confidence_level
FROM new_00_supports_master sm
WHERE
sm.embedding IS NOT NULL
AND (1 - (sm.embedding <=> query_embedding)) >= current_threshold
ORDER BY (1 - (sm.embedding <=> query_embedding)) DESC
LIMIT match_count;

GET DIAGNOSTICS results_temp_count = ROW_COUNT;
result_count := results_temp_count;

-- Étape 2: Si moins de 5 résultats, élargir avec threshold 0.20
IF result_count < 5 AND fallback_mode THEN
current_threshold := 0.20;

INSERT INTO temp_results
SELECT
sm.support,
sm.support_slug,
sm.categorie,
sm.lectorat,
sm.canal,
(1 - (sm.embedding <=> query_embedding))::float as similarity_score,
'Master Support (Fallback 0.20)' as match_source,
'Moyenne (Fallback)' as confidence_level
FROM new_00_supports_master sm
WHERE
sm.embedding IS NOT NULL
AND (1 - (sm.embedding <=> query_embedding)) >= current_threshold
AND (1 - (sm.embedding <=> query_embedding)) < match_threshold
AND NOT EXISTS (
SELECT 1 FROM temp_results tr WHERE tr.support_slug = sm.support_slug
)
ORDER BY (1 - (sm.embedding <=> query_embedding)) DESC
LIMIT (match_count - result_count);

GET DIAGNOSTICS results_temp_count = ROW_COUNT;
result_count := result_count + results_temp_count;
END IF;

-- Étape 3: Si toujours moins de 5 résultats, élargir avec threshold 0.15
IF result_count < 5 AND fallback_mode THEN
current_threshold := 0.15;

INSERT INTO temp_results
SELECT
sm.support,
sm.support_slug,
sm.categorie,
sm.lectorat,
sm.canal,
(1 - (sm.embedding <=> query_embedding))::float as similarity_score,
'Master Support (Fallback 0.15)' as match_source,
'Faible (Wide Search)' as confidence_level
FROM new_00_supports_master sm
WHERE
sm.embedding IS NOT NULL
AND (1 - (sm.embedding <=> query_embedding)) >= current_threshold
AND (1 - (sm.embedding <=> query_embedding)) < 0.20
AND NOT EXISTS (
SELECT 1 FROM temp_results tr WHERE tr.support_slug = sm.support_slug
)
ORDER BY (1 - (sm.embedding <=> query_embedding)) DESC
LIMIT (match_count - result_count);
END IF;

-- Retourner tous les résultats triés par score
RETURN QUERY
SELECT
tr.support,
tr.support_slug,
tr.categorie,
tr.lectorat,
tr.canal,
tr.similarity_score,
tr.match_source,
tr.confidence_level
FROM temp_results tr
ORDER BY tr.similarity_score DESC;

RETURN;
END;
$$;


--
-- Name: FUNCTION match_supports_pure_vector_open(query_embedding public.vector, match_threshold double precision, match_count integer, fallback_mode boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.match_supports_pure_vector_open(query_embedding public.vector, match_threshold double precision, match_count integer, fallback_mode boolean) IS 'Recherche vectorielle pure et inclusive avec thresholds bas (0.25/0.20/0.15) pour maximiser les correspondances sémantiques sur toute la langue française';


--
-- Name: match_supports_variants(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_supports_variants(query_embedding public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 10) RETURNS TABLE(variant_slug text, support text, support_slug text, canal text, periodicite_print text, diffusion_print integer, format_print text, tarif_brut text, tarif_net text, visites_par_mois_web integer, pages_vues_par_mois_web integer, nombre_envois_nl integer, categorie text, lectorat text, texte_vectorise text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
RETURN QUERY
SELECT
v.variant_slug,
v.support,
v.support_slug,
v.canal,
v.periodicite_print,
v.diffusion_print,
v.format_print,
v.tarif_brut,
v.tarif_net,
v.visites_par_mois_web,
v.pages_vues_par_mois_web,
v.nombre_envois_nl,
m.categorie,
m.lectorat,
v.texte_vectorise,
1 - (v.embedding <=> query_embedding) AS similarity
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.embedding IS NOT NULL
AND 1 - (v.embedding <=> query_embedding) > match_threshold
ORDER BY similarity DESC
LIMIT match_count;
END;
$$;


--
-- Name: match_supports_zero_failure(text, public.vector, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_supports_zero_failure(query_text text, query_embedding public.vector DEFAULT NULL::public.vector, max_results integer DEFAULT 20) RETURNS TABLE(support text, canal text, categorie text, lectorat text, tarif_net text, diffusion_print integer, periodicite_print text, prochaine_parution text, variant_slug text, similarity double precision, fallback_level integer, fallback_explanation text)
    LANGUAGE plpgsql
    AS $$
DECLARE
result_count integer := 0;
expanded_synonyms text[];
target_universe text;
BEGIN
-- NIVEAU 1: Recherche exacte par nom de profession
RETURN QUERY
SELECT
sv.support,
sv.canal,
sv.categorie,
sv.lectorat,
sv.tarif_net,
sv.diffusion_print,
sv.periodicite_print,
sv.prochaine_parution,
sv.variant_slug,
CASE
WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
THEN (1 - (sv.embedding <=> query_embedding))::float
ELSE 0.0::float
END AS similarity,
1 AS fallback_level,
'Match exact sur la cible' AS fallback_explanation
FROM new_01_supports_variants sv
WHERE
sv.categorie IS NOT NULL
AND (
LOWER(sv.categorie) LIKE '%' || LOWER(query_text) || '%'
OR LOWER(sv.lectorat) LIKE '%' || LOWER(query_text) || '%'
)
ORDER BY
CASE
WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
THEN sv.embedding <=> query_embedding
ELSE 999
END
LIMIT max_results;

GET DIAGNOSTICS result_count = ROW_COUNT;

IF result_count >= 5 THEN
RETURN;
END IF;

-- NIVEAU 2: Recherche avec synonymes
expanded_synonyms := ARRAY(
SELECT s.category
FROM expand_target_with_synonyms(query_text) s
);

IF array_length(expanded_synonyms, 1) > 0 THEN
RETURN QUERY
SELECT
sv.support,
sv.canal,
sv.categorie,
sv.lectorat,
sv.tarif_net,
sv.diffusion_print,
sv.periodicite_print,
sv.prochaine_parution,
sv.variant_slug,
CASE
WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
THEN (1 - (sv.embedding <=> query_embedding))::float
ELSE 0.0::float
END AS similarity,
2 AS fallback_level,
'Match via synonymes médicaux' AS fallback_explanation
FROM new_01_supports_variants sv
WHERE
sv.categorie = ANY(expanded_synonyms)
ORDER BY
CASE
WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
THEN sv.embedding <=> query_embedding
ELSE 999
END
LIMIT max_results;

GET DIAGNOSTICS result_count = ROW_COUNT;

IF result_count >= 5 THEN
RETURN;
END IF;
END IF;

-- NIVEAU 3: Recherche par univers sémantique (professions connexes)
SELECT s.universe INTO target_universe
FROM expand_target_with_synonyms(query_text) s
LIMIT 1;

IF target_universe IS NOT NULL THEN
RETURN QUERY
SELECT
sv.support,
sv.canal,
sv.categorie,
sv.lectorat,
sv.tarif_net,
sv.diffusion_print,
sv.periodicite_print,
sv.prochaine_parution,
sv.variant_slug,
CASE
WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
THEN (1 - (sv.embedding <=> query_embedding))::float
ELSE 0.0::float
END AS similarity,
3 AS fallback_level,
format('Match dans l''univers "%s" (professions connexes)', target_universe) AS fallback_explanation
FROM new_01_supports_variants sv
INNER JOIN medical_profession_synonyms s ON s.category = sv.categorie
WHERE
s.universe = target_universe
ORDER BY
s.confidence_score DESC,
CASE
WHEN query_embedding IS NOT NULL AND sv.embedding IS NOT NULL
THEN sv.embedding <=> query_embedding
ELSE 999
END
LIMIT max_results;

GET DIAGNOSTICS result_count = ROW_COUNT;

IF result_count >= 5 THEN
RETURN;
END IF;
END IF;

-- NIVEAU 4: Recherche sémantique large (si embedding fourni)
IF query_embedding IS NOT NULL THEN
RETURN QUERY
SELECT
sv.support,
sv.canal,
sv.categorie,
sv.lectorat,
sv.tarif_net,
sv.diffusion_print,
sv.periodicite_print,
sv.prochaine_parution,
sv.variant_slug,
(1 - (sv.embedding <=> query_embedding))::float AS similarity,
4 AS fallback_level,
'Match sémantique large sur le contenu du brief' AS fallback_explanation
FROM new_01_supports_variants sv
WHERE
sv.embedding IS NOT NULL
AND (1 - (sv.embedding <=> query_embedding)) >= 0.15
ORDER BY sv.embedding <=> query_embedding
LIMIT max_results;

GET DIAGNOSTICS result_count = ROW_COUNT;

IF result_count >= 5 THEN
RETURN;
END IF;
END IF;

-- NIVEAU 5: Supports généralistes les plus populaires (dernier recours)
RETURN QUERY
SELECT
sv.support,
sv.canal,
sv.categorie,
sv.lectorat,
sv.tarif_net,
sv.diffusion_print,
sv.periodicite_print,
sv.prochaine_parution,
sv.variant_slug,
0.0::float AS similarity,
5 AS fallback_level,
'Supports généralistes à audience large (aucun match direct trouvé)' AS fallback_explanation
FROM new_01_supports_variants sv
WHERE
sv.diffusion_print IS NOT NULL
AND sv.diffusion_print > 10000
ORDER BY sv.diffusion_print DESC NULLS LAST
LIMIT max_results;

RETURN;
END;
$$;


--
-- Name: match_visuels(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_visuels(query_embedding public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 10) RETURNS TABLE(id uuid, variant_slug text, support text, canal text, type_de_format text, notes text, texte_vectorise text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
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
ORDER BY new_03_visuels.embedding <=> query_embedding
LIMIT match_count;
END;
$$;


--
-- Name: update_contacts_texte_vectorise(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_contacts_texte_vectorise() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.texte_vectorise := CONCAT_WS(' | ',
    'Support: ' || COALESCE(NEW.support, ''),
    'Nom: ' || COALESCE(NEW.nom, ''),
    'Prénom: ' || COALESCE(NEW.prenom, ''),
    'Rôle: ' || COALESCE(NEW.role, ''),
    'Notes: ' || COALESCE(NEW.notes, '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_embedding(text, text, text, double precision[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding(table_name text, primary_key_name text, primary_key_value text, embedding_array double precision[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  EXECUTE format(
    'UPDATE %I SET embedding = $1 WHERE %I = $2',
    table_name,
    primary_key_name
  ) USING embedding_array::vector(1536), primary_key_value;
END;
$_$;


--
-- Name: update_embedding_bigint(text, text, bigint, double precision[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_bigint(table_name text, primary_key_name text, primary_key_value bigint, embedding_array double precision[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  EXECUTE format(
    'UPDATE %I SET embedding = $1 WHERE %I = $2',
    table_name,
    primary_key_name
  ) USING embedding_array::vector(1536), primary_key_value;
END;
$_$;


--
-- Name: update_embedding_contacts(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_contacts(p_id bigint, p_embedding_json text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
UPDATE new_04_contacts
SET embedding = p_embedding_json::vector
WHERE id = p_id;
END;
$$;


--
-- Name: update_embedding_planning_kits(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_planning_kits(p_id bigint, p_embedding_json text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE new_02_planning_kits_media
  SET embedding = p_embedding_json::vector
  WHERE id = p_id;
END;
$$;


--
-- Name: update_embedding_supports_master(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_supports_master(p_support_slug text, p_embedding_json text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
UPDATE new_00_supports_master
SET embedding = p_embedding_json::vector
WHERE support_slug = p_support_slug;
END;
$$;


--
-- Name: update_embedding_supports_variants(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_supports_variants(p_variant_slug text, p_embedding_json text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
UPDATE new_01_supports_variants
SET embedding = p_embedding_json::vector
WHERE variant_slug = p_variant_slug;
END;
$$;


--
-- Name: update_embedding_text(text, text, text, double precision[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_text(table_name text, primary_key_name text, primary_key_value text, embedding_array double precision[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  EXECUTE format(
    'UPDATE %I SET embedding = $1 WHERE %I = $2',
    table_name,
    primary_key_name
  ) USING embedding_array::vector(1536), primary_key_value;
END;
$_$;


--
-- Name: update_embedding_visuels(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_embedding_visuels(p_id bigint, p_embedding_json text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
UPDATE new_03_visuels
SET embedding = p_embedding_json::vector
WHERE id = p_id;
END;
$$;


--
-- Name: update_planning_kits_texte_vectorise(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_planning_kits_texte_vectorise() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.texte_vectorise := CONCAT_WS(' | ',
    'Support: ' || COALESCE(NEW.support, ''),
    'Canal: ' || COALESCE(NEW.canal, ''),
    'Type: ' || COALESCE(NEW.type, ''),
    'Date: ' || COALESCE(NEW.date_supabase::text, ''),
    'Périodicité: ' || COALESCE(NEW.periodicite, ''),
    'Spécifications techniques: ' || COALESCE(NEW.specs_techniques, ''),
    'Notes: ' || COALESCE(NEW.notes, '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_supports_master_texte_vectorise(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_supports_master_texte_vectorise() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
NEW.texte_vectorise := CONCAT_WS(' | ',
'Support: ' || COALESCE(NEW.support, ''),
'Catégorie: ' || COALESCE(NEW.categorie, ''),
'Lectorat: ' || COALESCE(NEW.lectorat, ''),
'Canal: ' || COALESCE(NEW.canal, '')
);
RETURN NEW;
END;
$$;


--
-- Name: update_supports_variants_texte_vectorise(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_supports_variants_texte_vectorise() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.texte_vectorise := CONCAT_WS(' | ',
    'Support: ' || COALESCE(NEW.support, ''),
    'Canal: ' || COALESCE(NEW.canal, ''),
    'Périodicité print: ' || COALESCE(NEW.periodicite_print, ''),
    'Format print: ' || COALESCE(NEW.format_print, ''),
    'Tarif brut: ' || COALESCE(NEW.tarif_brut, ''),
    'Tarif net: ' || COALESCE(NEW.tarif_net, '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


--
-- Name: update_visuels_texte_vectorise(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_visuels_texte_vectorise() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.texte_vectorise := CONCAT_WS(' | ',
    'Support: ' || COALESCE(NEW.support, ''),
    'Canal: ' || COALESCE(NEW.canal, ''),
    'Type de format: ' || COALESCE(NEW.type_de_format, ''),
    'Notes: ' || COALESCE(NEW.notes, '')
  );
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_hallucination_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_hallucination_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    user_query text NOT NULL,
    ai_response text NOT NULL,
    source_data jsonb DEFAULT '[]'::jsonb,
    detected_issues jsonb DEFAULT '[]'::jsonb,
    correction_appliquee boolean DEFAULT false,
    severity text DEFAULT 'low'::text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_hallucination_logs_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: TABLE ai_hallucination_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_hallucination_logs IS 'Logs des hallucinations détectées dans les réponses de LÉO';


--
-- Name: COLUMN ai_hallucination_logs.detected_issues; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_hallucination_logs.detected_issues IS 'Array JSON des hallucinations détectées avec leur type et sévérité';


--
-- Name: COLUMN ai_hallucination_logs.correction_appliquee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_hallucination_logs.correction_appliquee IS 'Indique si une correction automatique a été appliquée';


--
-- Name: COLUMN ai_hallucination_logs.severity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_hallucination_logs.severity IS 'Niveau de sévérité: low (1 correction), medium (2-3), high (4+)';


--
-- Name: brief_analysis_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brief_analysis_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    project_id uuid,
    brief_text text NOT NULL,
    targets_detected jsonb DEFAULT '[]'::jsonb,
    months_detected integer[] DEFAULT ARRAY[]::integer[],
    canals_detected text[] DEFAULT ARRAY[]::text[],
    budget_max_detected numeric,
    filters_applied jsonb DEFAULT '{}'::jsonb,
    supports_found integer DEFAULT 0,
    supports_by_canal jsonb DEFAULT '{}'::jsonb,
    fallbacks_used text[] DEFAULT ARRAY[]::text[],
    fallback_level integer DEFAULT 0,
    analysis_duration_ms integer,
    vector_search_duration_ms integer,
    export_generated boolean DEFAULT false,
    export_type text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: brief_extraction_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brief_extraction_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_name text NOT NULL,
    pattern_regex text NOT NULL,
    intent_type text NOT NULL,
    extracted_field text NOT NULL,
    priority integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT brief_extraction_rules_intent_type_check CHECK ((intent_type = ANY (ARRAY['month'::text, 'canal'::text, 'budget'::text, 'urgency'::text, 'other'::text])))
);


--
-- Name: excel_generation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.excel_generation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    brief_analysis_log_id uuid,
    devis_type text,
    annonceur text,
    campagne text,
    canal_counts jsonb DEFAULT '{}'::jsonb,
    total_supports integer DEFAULT 0,
    total_budget_estimated numeric,
    file_name text,
    file_size_kb integer,
    storage_path text,
    download_url text,
    generation_time_ms integer,
    status text DEFAULT 'pending'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    flow_id uuid,
    templates_used text[] DEFAULT ARRAY[]::text[],
    files_generated integer DEFAULT 0,
    supports_per_file jsonb DEFAULT '{}'::jsonb,
    file_urls jsonb DEFAULT '[]'::jsonb,
    storage_paths jsonb DEFAULT '[]'::jsonb,
    template_fill_errors jsonb DEFAULT '{}'::jsonb,
    success boolean DEFAULT false,
    CONSTRAINT excel_generation_logs_devis_type_check CHECK ((devis_type = ANY (ARRAY['excel'::text, 'powerpoint'::text]))),
    CONSTRAINT excel_generation_logs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: export_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    document_type text NOT NULL,
    file_url text,
    file_size integer,
    generation_status text DEFAULT 'pending'::text,
    error_message text,
    generated_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT export_documents_document_type_check CHECK ((document_type = ANY (ARRAY['excel'::text, 'powerpoint'::text, 'strategic_text'::text, 'pdf'::text]))),
    CONSTRAINT export_documents_generation_status_check CHECK ((generation_status = ANY (ARRAY['pending'::text, 'generating'::text, 'ready'::text, 'error'::text])))
);


--
-- Name: media_supports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_supports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    logo_url text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    CONSTRAINT valid_category CHECK ((category = ANY (ARRAY['Display'::text, 'Social'::text, 'Search'::text, 'Programmatic'::text, 'Native'::text, 'Video'::text])))
);


--
-- Name: medical_profession_synonyms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_profession_synonyms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    synonym text NOT NULL,
    category text NOT NULL,
    universe text,
    confidence_score integer DEFAULT 100,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: new_00_supports_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.new_00_supports_master (
    support text NOT NULL,
    support_slug text NOT NULL,
    categorie text,
    lectorat text,
    canal text,
    new_01_supports_variants_2 text,
    texte_vectorise text,
    embedding public.vector(1536)
);


--
-- Name: new_01_supports_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.new_01_supports_variants (
    variant_slug text NOT NULL,
    support text NOT NULL,
    support_slug text NOT NULL,
    canal text,
    periodicite_print text,
    diffusion_print integer,
    format_print text,
    visites_par_mois_web integer,
    pages_vues_par_mois_web integer,
    nombre_envois_nl integer,
    tarif_brut text,
    tarif_net text,
    texte_vectorise text,
    embedding public.vector(1536)
);


--
-- Name: new_02_planning_kits_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.new_02_planning_kits_media (
    id bigint NOT NULL,
    variant_slug text NOT NULL,
    support text NOT NULL,
    canal text,
    type text,
    date_supabase date,
    periodicite text,
    specs_techniques text,
    notes text,
    texte_vectorise text,
    embedding public.vector(1536)
);


--
-- Name: new_02_planning_kits_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.new_02_planning_kits_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: new_02_planning_kits_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.new_02_planning_kits_media_id_seq OWNED BY public.new_02_planning_kits_media.id;


--
-- Name: new_03_visuels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.new_03_visuels (
    id bigint NOT NULL,
    variant_slug text NOT NULL,
    support text NOT NULL,
    canal text,
    fichier_integre text,
    fichier_url text,
    type_de_format text,
    notes text,
    texte_vectorise text,
    embedding public.vector(1536)
);


--
-- Name: new_03_visuels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.new_03_visuels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: new_03_visuels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.new_03_visuels_id_seq OWNED BY public.new_03_visuels.id;


--
-- Name: new_04_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.new_04_contacts (
    id bigint NOT NULL,
    variant_slug text NOT NULL,
    support text NOT NULL,
    canal text,
    nom text,
    prenom text,
    email text,
    telephone text,
    role text,
    notes text,
    texte_vectorise text,
    embedding public.vector(1536)
);


--
-- Name: new_04_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.new_04_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: new_04_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.new_04_contacts_id_seq OWNED BY public.new_04_contacts.id;


--
-- Name: planning_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    event_type text DEFAULT 'other'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_date_range CHECK ((end_date >= start_date)),
    CONSTRAINT valid_event_type CHECK ((event_type = ANY (ARRAY['meeting'::text, 'deadline'::text, 'review'::text, 'other'::text])))
);


--
-- Name: pls_flow_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pls_flow_selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    support_slug text,
    variant_slug text,
    selected_at_step integer NOT NULL,
    estimated_cost numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pls_flow_selections_selected_at_step_check CHECK (((selected_at_step >= 2) AND (selected_at_step <= 3)))
);


--
-- Name: pls_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pls_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_step integer DEFAULT 1 NOT NULL,
    brief_data jsonb DEFAULT '{}'::jsonb,
    selection_data jsonb DEFAULT '{}'::jsonb,
    refinement_data jsonb DEFAULT '{}'::jsonb,
    quote_data jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    strategy_recap_data jsonb DEFAULT '{}'::jsonb,
    chosen_strategy text,
    two_strategies_data jsonb DEFAULT '[]'::jsonb,
    strategic_text_content text,
    export_urls jsonb DEFAULT '{}'::jsonb,
    completion_percentage integer DEFAULT 0,
    CONSTRAINT pls_flows_current_step_check CHECK (((current_step >= 1) AND (current_step <= 5))),
    CONSTRAINT pls_flows_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text, 'abandoned'::text])))
);


--
-- Name: profession_to_category_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profession_to_category_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profession_keyword text NOT NULL,
    exact_category_name text NOT NULL,
    synonyms text[] DEFAULT ARRAY[]::text[],
    priority_level text DEFAULT 'high'::text,
    created_at timestamp with time zone DEFAULT now(),
    common_misspellings text[] DEFAULT ARRAY[]::text[]
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    company text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_logo text
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_name text NOT NULL,
    campaign_name text NOT NULL,
    objective text NOT NULL,
    target text NOT NULL,
    channel text DEFAULT 'web'::text NOT NULL,
    budget numeric NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT positive_budget CHECK ((budget > (0)::numeric)),
    CONSTRAINT valid_channel CHECK ((channel = ANY (ARRAY['web'::text, 'print'::text, 'newsletter'::text, 'mixed'::text]))),
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    media_plan jsonb DEFAULT '{}'::jsonb NOT NULL,
    estimated_reach numeric DEFAULT 0,
    estimated_impressions numeric DEFAULT 0,
    confidence_score numeric DEFAULT 0,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT positive_impressions CHECK ((estimated_impressions >= (0)::numeric)),
    CONSTRAINT positive_reach CHECK ((estimated_reach >= (0)::numeric)),
    CONSTRAINT valid_confidence CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric)))
);


--
-- Name: semantic_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semantic_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keyword text NOT NULL,
    target_categorie text,
    target_canal text,
    boost_score numeric DEFAULT 1.2,
    priority_level text DEFAULT 'medium'::text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT semantic_mappings_priority_level_check CHECK ((priority_level = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: TABLE semantic_mappings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.semantic_mappings IS 'Strategic keyword mappings to boost relevant supports based on brief content';


--
-- Name: semantic_boost_usage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.semantic_boost_usage AS
 SELECT keyword,
    target_categorie,
    target_canal,
    boost_score,
    priority_level,
    description,
    created_at
   FROM public.semantic_mappings
  ORDER BY priority_level DESC, boost_score DESC;


--
-- Name: VIEW semantic_boost_usage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.semantic_boost_usage IS 'Vue des mappings sémantiques actifs, triés par priorité et boost.';


--
-- Name: strategy_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    strategy_type text NOT NULL,
    strategy_name text NOT NULL,
    description text,
    advantages jsonb DEFAULT '[]'::jsonb,
    considerations jsonb DEFAULT '[]'::jsonb,
    metrics jsonb DEFAULT '{}'::jsonb,
    supports_count integer DEFAULT 0,
    total_budget numeric(12,2) DEFAULT 0,
    estimated_reach integer DEFAULT 0,
    channels text[] DEFAULT ARRAY[]::text[],
    is_recommended boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: target_detection_diagnostics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.target_detection_diagnostics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    brief_text text NOT NULL,
    explicit_targets_found jsonb DEFAULT '[]'::jsonb,
    vector_targets_found jsonb DEFAULT '[]'::jsonb,
    merged_targets jsonb DEFAULT '[]'::jsonb,
    results_per_target jsonb DEFAULT '{}'::jsonb,
    fallback_applied jsonb DEFAULT '{}'::jsonb,
    execution_time_ms integer,
    error_message text
);


--
-- Name: todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.todos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_priority CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: new_02_planning_kits_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_02_planning_kits_media ALTER COLUMN id SET DEFAULT nextval('public.new_02_planning_kits_media_id_seq'::regclass);


--
-- Name: new_03_visuels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_03_visuels ALTER COLUMN id SET DEFAULT nextval('public.new_03_visuels_id_seq'::regclass);


--
-- Name: new_04_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_04_contacts ALTER COLUMN id SET DEFAULT nextval('public.new_04_contacts_id_seq'::regclass);


--
-- Name: ai_hallucination_logs ai_hallucination_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_hallucination_logs
    ADD CONSTRAINT ai_hallucination_logs_pkey PRIMARY KEY (id);


--
-- Name: brief_analysis_logs brief_analysis_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_analysis_logs
    ADD CONSTRAINT brief_analysis_logs_pkey PRIMARY KEY (id);


--
-- Name: brief_extraction_rules brief_extraction_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_extraction_rules
    ADD CONSTRAINT brief_extraction_rules_pkey PRIMARY KEY (id);


--
-- Name: excel_generation_logs excel_generation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_generation_logs
    ADD CONSTRAINT excel_generation_logs_pkey PRIMARY KEY (id);


--
-- Name: export_documents export_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents
    ADD CONSTRAINT export_documents_pkey PRIMARY KEY (id);


--
-- Name: media_supports media_supports_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_supports
    ADD CONSTRAINT media_supports_name_key UNIQUE (name);


--
-- Name: media_supports media_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_supports
    ADD CONSTRAINT media_supports_pkey PRIMARY KEY (id);


--
-- Name: medical_profession_synonyms medical_profession_synonyms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_profession_synonyms
    ADD CONSTRAINT medical_profession_synonyms_pkey PRIMARY KEY (id);


--
-- Name: new_00_supports_master new_00_supports_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_00_supports_master
    ADD CONSTRAINT new_00_supports_master_pkey PRIMARY KEY (support_slug);


--
-- Name: new_01_supports_variants new_01_supports_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_01_supports_variants
    ADD CONSTRAINT new_01_supports_variants_pkey PRIMARY KEY (variant_slug);


--
-- Name: new_02_planning_kits_media new_02_planning_kits_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_02_planning_kits_media
    ADD CONSTRAINT new_02_planning_kits_media_pkey PRIMARY KEY (id);


--
-- Name: new_03_visuels new_03_visuels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_03_visuels
    ADD CONSTRAINT new_03_visuels_pkey PRIMARY KEY (id);


--
-- Name: new_04_contacts new_04_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_04_contacts
    ADD CONSTRAINT new_04_contacts_pkey PRIMARY KEY (id);


--
-- Name: planning_events planning_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_events
    ADD CONSTRAINT planning_events_pkey PRIMARY KEY (id);


--
-- Name: pls_flow_selections pls_flow_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pls_flow_selections
    ADD CONSTRAINT pls_flow_selections_pkey PRIMARY KEY (id);


--
-- Name: pls_flows pls_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pls_flows
    ADD CONSTRAINT pls_flows_pkey PRIMARY KEY (id);


--
-- Name: profession_to_category_mappings profession_to_category_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profession_to_category_mappings
    ADD CONSTRAINT profession_to_category_mappings_pkey PRIMARY KEY (id);


--
-- Name: profession_to_category_mappings profession_to_category_mappings_profession_keyword_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profession_to_category_mappings
    ADD CONSTRAINT profession_to_category_mappings_profession_keyword_key UNIQUE (profession_keyword);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: semantic_mappings semantic_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semantic_mappings
    ADD CONSTRAINT semantic_mappings_pkey PRIMARY KEY (id);


--
-- Name: strategy_recommendations strategy_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_recommendations
    ADD CONSTRAINT strategy_recommendations_pkey PRIMARY KEY (id);


--
-- Name: target_detection_diagnostics target_detection_diagnostics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_detection_diagnostics
    ADD CONSTRAINT target_detection_diagnostics_pkey PRIMARY KEY (id);


--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: idx_brief_analysis_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brief_analysis_logs_user_created ON public.brief_analysis_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_brief_extraction_rules_intent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brief_extraction_rules_intent_type ON public.brief_extraction_rules USING btree (intent_type) WHERE (is_active = true);


--
-- Name: idx_contacts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_email ON public.new_04_contacts USING btree (email);


--
-- Name: idx_contacts_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_embedding ON public.new_04_contacts USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_contacts_variant_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_variant_slug ON public.new_04_contacts USING btree (variant_slug);


--
-- Name: idx_diagnostics_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostics_created_at ON public.target_detection_diagnostics USING btree (created_at DESC);


--
-- Name: idx_diagnostics_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostics_user_id ON public.target_detection_diagnostics USING btree (user_id);


--
-- Name: idx_excel_generation_logs_flow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_generation_logs_flow_id ON public.excel_generation_logs USING btree (flow_id);


--
-- Name: idx_excel_generation_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_generation_logs_user_created ON public.excel_generation_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_export_documents_flow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_documents_flow_id ON public.export_documents USING btree (flow_id);


--
-- Name: idx_export_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_documents_status ON public.export_documents USING btree (generation_status);


--
-- Name: idx_hallucination_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hallucination_logs_created_at ON public.ai_hallucination_logs USING btree (created_at DESC);


--
-- Name: idx_hallucination_logs_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hallucination_logs_severity ON public.ai_hallucination_logs USING btree (severity);


--
-- Name: idx_hallucination_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hallucination_logs_user_id ON public.ai_hallucination_logs USING btree (user_id);


--
-- Name: idx_planning_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planning_date ON public.new_02_planning_kits_media USING btree (date_supabase);


--
-- Name: idx_planning_events_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planning_events_project_id ON public.planning_events USING btree (project_id);


--
-- Name: idx_planning_events_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planning_events_start_date ON public.planning_events USING btree (start_date);


--
-- Name: idx_planning_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planning_events_user_id ON public.planning_events USING btree (user_id);


--
-- Name: idx_planning_kits_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planning_kits_embedding ON public.new_02_planning_kits_media USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_planning_variant_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planning_variant_slug ON public.new_02_planning_kits_media USING btree (variant_slug);


--
-- Name: idx_pls_flow_selections_flow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pls_flow_selections_flow_id ON public.pls_flow_selections USING btree (flow_id);


--
-- Name: idx_pls_flows_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pls_flows_status ON public.pls_flows USING btree (status);


--
-- Name: idx_pls_flows_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pls_flows_user_id ON public.pls_flows USING btree (user_id);


--
-- Name: idx_profession_mappings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profession_mappings_category ON public.profession_to_category_mappings USING btree (exact_category_name);


--
-- Name: idx_profession_mappings_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profession_mappings_keyword ON public.profession_to_category_mappings USING btree (profession_keyword);


--
-- Name: idx_profession_mappings_synonyms; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profession_mappings_synonyms ON public.profession_to_category_mappings USING gin (synonyms);


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at DESC);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_projects_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_user_id ON public.projects USING btree (user_id);


--
-- Name: idx_recommendations_generated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_generated_at ON public.recommendations USING btree (generated_at DESC);


--
-- Name: idx_recommendations_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendations_project_id ON public.recommendations USING btree (project_id);


--
-- Name: idx_semantic_mappings_categorie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_semantic_mappings_categorie ON public.semantic_mappings USING btree (target_categorie);


--
-- Name: idx_semantic_mappings_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_semantic_mappings_keyword ON public.semantic_mappings USING btree (keyword);


--
-- Name: idx_semantic_mappings_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_semantic_mappings_priority ON public.semantic_mappings USING btree (priority_level DESC, boost_score DESC);


--
-- Name: idx_semantic_mappings_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_semantic_mappings_unique ON public.semantic_mappings USING btree (keyword, COALESCE(target_categorie, ''::text), COALESCE(target_canal, ''::text));


--
-- Name: idx_strategy_recommendations_flow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strategy_recommendations_flow_id ON public.strategy_recommendations USING btree (flow_id);


--
-- Name: idx_supports_master_categorie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supports_master_categorie ON public.new_00_supports_master USING btree (categorie);


--
-- Name: idx_supports_master_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supports_master_embedding ON public.new_00_supports_master USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_supports_variants_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supports_variants_embedding ON public.new_01_supports_variants USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_synonyms_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synonyms_canonical ON public.medical_profession_synonyms USING btree (canonical_name);


--
-- Name: idx_synonyms_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synonyms_category ON public.medical_profession_synonyms USING btree (category);


--
-- Name: idx_synonyms_synonym; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synonyms_synonym ON public.medical_profession_synonyms USING btree (synonym);


--
-- Name: idx_synonyms_universe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synonyms_universe ON public.medical_profession_synonyms USING btree (universe);


--
-- Name: idx_todos_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_todos_due_date ON public.todos USING btree (due_date);


--
-- Name: idx_todos_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_todos_project_id ON public.todos USING btree (project_id);


--
-- Name: idx_todos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_todos_status ON public.todos USING btree (status);


--
-- Name: idx_todos_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_todos_user_id ON public.todos USING btree (user_id);


--
-- Name: idx_variants_support_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_support_slug ON public.new_01_supports_variants USING btree (support_slug);


--
-- Name: idx_visuels_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visuels_embedding ON public.new_03_visuels USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_visuels_variant_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visuels_variant_slug ON public.new_03_visuels USING btree (variant_slug);


--
-- Name: new_04_contacts trigger_update_contacts_texte; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_contacts_texte BEFORE INSERT OR UPDATE ON public.new_04_contacts FOR EACH ROW EXECUTE FUNCTION public.update_contacts_texte_vectorise();


--
-- Name: new_02_planning_kits_media trigger_update_planning_kits_texte; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_planning_kits_texte BEFORE INSERT OR UPDATE ON public.new_02_planning_kits_media FOR EACH ROW EXECUTE FUNCTION public.update_planning_kits_texte_vectorise();


--
-- Name: new_00_supports_master trigger_update_supports_master_texte; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_supports_master_texte BEFORE INSERT OR UPDATE ON public.new_00_supports_master FOR EACH ROW EXECUTE FUNCTION public.update_supports_master_texte_vectorise();


--
-- Name: new_01_supports_variants trigger_update_supports_variants_texte; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_supports_variants_texte BEFORE INSERT OR UPDATE ON public.new_01_supports_variants FOR EACH ROW EXECUTE FUNCTION public.update_supports_variants_texte_vectorise();


--
-- Name: new_03_visuels trigger_update_visuels_texte; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_visuels_texte BEFORE INSERT OR UPDATE ON public.new_03_visuels FOR EACH ROW EXECUTE FUNCTION public.update_visuels_texte_vectorise();


--
-- Name: planning_events update_planning_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_planning_events_updated_at BEFORE UPDATE ON public.planning_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: todos update_todos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_hallucination_logs ai_hallucination_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_hallucination_logs
    ADD CONSTRAINT ai_hallucination_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: brief_analysis_logs brief_analysis_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_analysis_logs
    ADD CONSTRAINT brief_analysis_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: excel_generation_logs excel_generation_logs_brief_analysis_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_generation_logs
    ADD CONSTRAINT excel_generation_logs_brief_analysis_log_id_fkey FOREIGN KEY (brief_analysis_log_id) REFERENCES public.brief_analysis_logs(id) ON DELETE SET NULL;


--
-- Name: excel_generation_logs excel_generation_logs_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_generation_logs
    ADD CONSTRAINT excel_generation_logs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.pls_flows(id) ON DELETE CASCADE;


--
-- Name: excel_generation_logs excel_generation_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_generation_logs
    ADD CONSTRAINT excel_generation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: export_documents export_documents_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_documents
    ADD CONSTRAINT export_documents_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.pls_flows(id) ON DELETE CASCADE;


--
-- Name: new_01_supports_variants fk_support_slug; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_01_supports_variants
    ADD CONSTRAINT fk_support_slug FOREIGN KEY (support_slug) REFERENCES public.new_00_supports_master(support_slug) ON DELETE CASCADE;


--
-- Name: new_02_planning_kits_media fk_variant_slug; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_02_planning_kits_media
    ADD CONSTRAINT fk_variant_slug FOREIGN KEY (variant_slug) REFERENCES public.new_01_supports_variants(variant_slug) ON DELETE CASCADE;


--
-- Name: new_03_visuels fk_variant_slug; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_03_visuels
    ADD CONSTRAINT fk_variant_slug FOREIGN KEY (variant_slug) REFERENCES public.new_01_supports_variants(variant_slug) ON DELETE CASCADE;


--
-- Name: new_04_contacts fk_variant_slug; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.new_04_contacts
    ADD CONSTRAINT fk_variant_slug FOREIGN KEY (variant_slug) REFERENCES public.new_01_supports_variants(variant_slug) ON DELETE CASCADE;


--
-- Name: media_supports media_supports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_supports
    ADD CONSTRAINT media_supports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: planning_events planning_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_events
    ADD CONSTRAINT planning_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: planning_events planning_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_events
    ADD CONSTRAINT planning_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pls_flow_selections pls_flow_selections_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pls_flow_selections
    ADD CONSTRAINT pls_flow_selections_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.pls_flows(id) ON DELETE CASCADE;


--
-- Name: pls_flows pls_flows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pls_flows
    ADD CONSTRAINT pls_flows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: strategy_recommendations strategy_recommendations_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_recommendations
    ADD CONSTRAINT strategy_recommendations_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.pls_flows(id) ON DELETE CASCADE;


--
-- Name: target_detection_diagnostics target_detection_diagnostics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_detection_diagnostics
    ADD CONSTRAINT target_detection_diagnostics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: todos todos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: todos todos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: ai_hallucination_logs Admins can read all hallucination logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all hallucination logs" ON public.ai_hallucination_logs FOR SELECT TO authenticated USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text) OR (auth.uid() = user_id)));


--
-- Name: semantic_mappings Allow read access to semantic_mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read access to semantic_mappings" ON public.semantic_mappings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: new_04_contacts Anyone can insert contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert contacts" ON public.new_04_contacts FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: new_02_planning_kits_media Anyone can insert planning; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert planning" ON public.new_02_planning_kits_media FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: new_00_supports_master Anyone can insert supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert supports" ON public.new_00_supports_master FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: new_01_supports_variants Anyone can insert variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert variants" ON public.new_01_supports_variants FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: new_03_visuels Anyone can insert visuels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert visuels" ON public.new_03_visuels FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: new_04_contacts Anyone can read contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read contacts" ON public.new_04_contacts FOR SELECT TO authenticated, anon USING (true);


--
-- Name: new_02_planning_kits_media Anyone can read planning; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read planning" ON public.new_02_planning_kits_media FOR SELECT TO authenticated, anon USING (true);


--
-- Name: new_00_supports_master Anyone can read supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read supports" ON public.new_00_supports_master FOR SELECT TO authenticated, anon USING (true);


--
-- Name: new_01_supports_variants Anyone can read variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read variants" ON public.new_01_supports_variants FOR SELECT TO authenticated, anon USING (true);


--
-- Name: new_03_visuels Anyone can read visuels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read visuels" ON public.new_03_visuels FOR SELECT TO authenticated, anon USING (true);


--
-- Name: new_04_contacts Anyone can update contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update contacts" ON public.new_04_contacts FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: new_02_planning_kits_media Anyone can update planning kits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update planning kits" ON public.new_02_planning_kits_media FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: new_00_supports_master Anyone can update supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update supports" ON public.new_00_supports_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: new_01_supports_variants Anyone can update supports variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update supports variants" ON public.new_01_supports_variants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: new_03_visuels Anyone can update visuels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update visuels" ON public.new_03_visuels FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: profession_to_category_mappings Authenticated users can read profession mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read profession mappings" ON public.profession_to_category_mappings FOR SELECT TO authenticated USING (true);


--
-- Name: semantic_mappings Authenticated users can read semantic mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read semantic mappings" ON public.semantic_mappings FOR SELECT TO authenticated USING (true);


--
-- Name: brief_extraction_rules Brief extraction rules are manageable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Brief extraction rules are manageable by authenticated users" ON public.brief_extraction_rules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: brief_extraction_rules Brief extraction rules are readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Brief extraction rules are readable by authenticated users" ON public.brief_extraction_rules FOR SELECT TO authenticated USING (true);


--
-- Name: medical_profession_synonyms Public read access for synonyms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access for synonyms" ON public.medical_profession_synonyms FOR SELECT USING (true);


--
-- Name: target_detection_diagnostics Service role can insert diagnostics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert diagnostics" ON public.target_detection_diagnostics FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: profession_to_category_mappings Service role can manage profession mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage profession mappings" ON public.profession_to_category_mappings TO service_role USING (true) WITH CHECK (true);


--
-- Name: semantic_mappings Service role can manage semantic mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage semantic mappings" ON public.semantic_mappings TO service_role USING (true) WITH CHECK (true);


--
-- Name: target_detection_diagnostics Service role can read all diagnostics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read all diagnostics" ON public.target_detection_diagnostics FOR SELECT TO service_role USING (true);


--
-- Name: ai_hallucination_logs System can insert hallucination logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert hallucination logs" ON public.ai_hallucination_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: pls_flow_selections Users can delete own flow selections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own flow selections" ON public.pls_flow_selections FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = pls_flow_selections.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flows Users can delete own flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own flows" ON public.pls_flows FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: media_supports Users can delete own media supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own media supports" ON public.media_supports FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: planning_events Users can delete own planning events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own planning events" ON public.planning_events FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: projects Users can delete own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: todos Users can delete own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own todos" ON public.todos FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: recommendations Users can delete recommendations for own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete recommendations for own projects" ON public.recommendations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = recommendations.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: brief_analysis_logs Users can insert own analysis logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own analysis logs" ON public.brief_analysis_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: export_documents Users can insert own export documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own export documents" ON public.export_documents FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = export_documents.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flow_selections Users can insert own flow selections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own flow selections" ON public.pls_flow_selections FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = pls_flow_selections.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flows Users can insert own flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own flows" ON public.pls_flows FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: media_supports Users can insert own media supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own media supports" ON public.media_supports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: planning_events Users can insert own planning events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own planning events" ON public.planning_events FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: projects Users can insert own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: strategy_recommendations Users can insert own strategy recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own strategy recommendations" ON public.strategy_recommendations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = strategy_recommendations.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: todos Users can insert own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own todos" ON public.todos FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: recommendations Users can insert recommendations for own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert recommendations for own projects" ON public.recommendations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = recommendations.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: excel_generation_logs Users can manage own generation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own generation logs" ON public.excel_generation_logs TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: target_detection_diagnostics Users can read own diagnostics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own diagnostics" ON public.target_detection_diagnostics FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: export_documents Users can update own export documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own export documents" ON public.export_documents FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = export_documents.flow_id) AND (pls_flows.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = export_documents.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flow_selections Users can update own flow selections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own flow selections" ON public.pls_flow_selections FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = pls_flow_selections.flow_id) AND (pls_flows.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = pls_flow_selections.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flows Users can update own flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own flows" ON public.pls_flows FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: media_supports Users can update own media supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own media supports" ON public.media_supports FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: planning_events Users can update own planning events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own planning events" ON public.planning_events FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: projects Users can update own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: strategy_recommendations Users can update own strategy recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own strategy recommendations" ON public.strategy_recommendations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = strategy_recommendations.flow_id) AND (pls_flows.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = strategy_recommendations.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: todos Users can update own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own todos" ON public.todos FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: recommendations Users can update recommendations for own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update recommendations for own projects" ON public.recommendations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = recommendations.project_id) AND (projects.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = recommendations.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: brief_analysis_logs Users can view own analysis logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own analysis logs" ON public.brief_analysis_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: export_documents Users can view own export documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own export documents" ON public.export_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = export_documents.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flow_selections Users can view own flow selections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own flow selections" ON public.pls_flow_selections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = pls_flow_selections.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: pls_flows Users can view own flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own flows" ON public.pls_flows FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: excel_generation_logs Users can view own generation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own generation logs" ON public.excel_generation_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: media_supports Users can view own media supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own media supports" ON public.media_supports FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: planning_events Users can view own planning events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own planning events" ON public.planning_events FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: projects Users can view own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: strategy_recommendations Users can view own strategy recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own strategy recommendations" ON public.strategy_recommendations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pls_flows
  WHERE ((pls_flows.id = strategy_recommendations.flow_id) AND (pls_flows.user_id = auth.uid())))));


--
-- Name: todos Users can view own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own todos" ON public.todos FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: recommendations Users can view recommendations for own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view recommendations for own projects" ON public.recommendations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = recommendations.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: ai_hallucination_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_hallucination_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: brief_analysis_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brief_analysis_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: brief_extraction_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brief_extraction_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: excel_generation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.excel_generation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: export_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: media_supports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_supports ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_profession_synonyms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medical_profession_synonyms ENABLE ROW LEVEL SECURITY;

--
-- Name: new_00_supports_master; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.new_00_supports_master ENABLE ROW LEVEL SECURITY;

--
-- Name: new_01_supports_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.new_01_supports_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: new_02_planning_kits_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.new_02_planning_kits_media ENABLE ROW LEVEL SECURITY;

--
-- Name: new_03_visuels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.new_03_visuels ENABLE ROW LEVEL SECURITY;

--
-- Name: new_04_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.new_04_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: planning_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planning_events ENABLE ROW LEVEL SECURITY;

--
-- Name: pls_flow_selections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pls_flow_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: pls_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pls_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: profession_to_category_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profession_to_category_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: semantic_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semantic_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: strategy_recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.strategy_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: target_detection_diagnostics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.target_detection_diagnostics ENABLE ROW LEVEL SECURITY;

--
-- Name: todos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


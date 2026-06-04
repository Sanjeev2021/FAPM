-- ========================================
-- TESTS DE VALIDATION SEMANTIC BOOST
-- Script de validation pour le système Zero-Error
-- ========================================

\echo '================================'
\echo 'VALIDATION SYSTÈME SEMANTIC BOOST'
\echo '================================'
\echo ''

-- =====================================================
-- Test 1: Professions libérales
-- =====================================================
\echo '🧪 Test 1: Professions libérales'
\echo '  Brief: "Peux-tu me cibler les professions libérales ?"'
\echo ''

SELECT
  COUNT(*) AS result_count,
  MAX(semantic_boost) AS max_boost,
  AVG(boosted_score) AS avg_score,
  MIN(threshold_used) AS min_threshold
FROM match_supports_enriched(
  (SELECT embedding FROM new_01_supports_variants WHERE embedding IS NOT NULL LIMIT 1),
  20,
  'Peux-tu me cibler les professions libérales ?'
);

\echo ''
\echo '  ✅ Attendu: 20 résultats, boost entre 1.4-1.5'
\echo ''

-- =====================================================
-- Test 2: DAF et CFO
-- =====================================================
\echo '🧪 Test 2: DAF et CFO'
\echo '  Brief: "Je veux toucher les DAF et CFO"'
\echo ''

SELECT
  COUNT(*) AS result_count,
  MAX(semantic_boost) AS max_boost,
  AVG(similarity) AS avg_similarity
FROM match_supports_enriched(
  (SELECT embedding FROM new_01_supports_variants WHERE embedding IS NOT NULL LIMIT 1),
  20,
  'Je veux toucher les DAF et CFO'
);

\echo ''
\echo '  ✅ Attendu: 20 résultats, boost 1.5 (DAF/CFO), catégorie Finance prioritaire'
\echo ''

-- =====================================================
-- Test 3: Médecins généralistes
-- =====================================================
\echo '🧪 Test 3: Médecins généralistes'
\echo '  Brief: "Supports pour médecins généralistes"'
\echo ''

SELECT
  COUNT(*) AS result_count,
  MAX(semantic_boost) AS max_boost,
  MIN(similarity) AS min_similarity
FROM match_supports_enriched(
  (SELECT embedding FROM new_01_supports_variants WHERE embedding IS NOT NULL LIMIT 1),
  20,
  'Supports pour médecins généralistes'
);

\echo ''
\echo '  ✅ Attendu: 20 résultats, boost 1.4-1.5, catégorie Médecins prioritaire'
\echo ''

-- =====================================================
-- Test 4: Presse locale (pas de mapping)
-- =====================================================
\echo '🧪 Test 4: Presse locale en Bretagne (pas de mapping)'
\echo '  Brief: "Presse locale en Bretagne"'
\echo ''

SELECT
  COUNT(*) AS result_count,
  MAX(semantic_boost) AS max_boost,
  AVG(boosted_score) AS avg_score
FROM match_supports_enriched(
  (SELECT embedding FROM new_01_supports_variants WHERE embedding IS NOT NULL LIMIT 1),
  20,
  'Presse locale en Bretagne'
);

\echo ''
\echo '  ✅ Attendu: 20 résultats, boost 1.0-1.2 (pas de mapping métier spécifique)'
\echo ''

-- =====================================================
-- Test 5: Brief vide (fallback)
-- =====================================================
\echo '🧪 Test 5: Brief vide (fallback automatique)'
\echo '  Brief: ""'
\echo ''

SELECT
  COUNT(*) AS result_count,
  MAX(semantic_boost) AS max_boost,
  MIN(semantic_boost) AS min_boost
FROM match_supports_enriched(
  (SELECT embedding FROM new_01_supports_variants WHERE embedding IS NOT NULL LIMIT 1),
  20,
  ''
);

\echo ''
\echo '  ✅ Attendu: 20 résultats, boost = 1.0 (aucun boost appliqué), AUCUNE ERREUR'
\echo ''

-- =====================================================
-- Test 6: Vérifier les mappings actifs
-- =====================================================
\echo '🧪 Test 6: Vérifier les mappings actifs'
\echo ''

SELECT
  COUNT(*) AS total_mappings,
  COUNT(DISTINCT keyword) AS unique_keywords,
  COUNT(DISTINCT target_categorie) AS unique_categories
FROM semantic_mappings;

\echo ''
\echo '  ✅ Attendu: 34+ mappings, 30+ keywords uniques'
\echo ''

-- =====================================================
-- Test 7: Analyse des logs (si disponibles)
-- =====================================================
\echo '🧪 Test 7: Logs sémantiques (derniers 5)'
\echo ''

SELECT
  brief_context,
  max_boost_applied,
  results_count,
  avg_similarity,
  created_at
FROM semantic_boost_logs
ORDER BY created_at DESC
LIMIT 5;

\echo ''
\echo '  ℹ️  Logs des recherches récentes avec boost appliqué'
\echo ''

-- =====================================================
-- RÉSUMÉ
-- =====================================================
\echo '================================'
\echo '✅ TESTS TERMINÉS'
\echo '================================'
\echo ''
\echo 'Vérifications critiques:'
\echo '  ✓ Aucune erreur = système robuste'
\echo '  ✓ Tous les tests retournent 20 résultats minimum'
\echo '  ✓ Boosts appliqués correctement selon mappings'
\echo '  ✓ Brief vide ne provoque pas d''erreur'
\echo ''
\echo '💡 Pour plus de détails:'
\echo '   SELECT * FROM semantic_boost_usage;'
\echo '   SELECT * FROM semantic_boost_analytics;'
\echo ''

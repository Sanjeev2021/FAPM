/**
 * Test du système multi-cibles
 * Valide la détection automatique et le filtrage par cible
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface MultiTargetTest {
  name: string;
  query: string;
  expectedTargets: string[];
  expectedMinSupportsPerTarget?: number;
}

const MULTI_TARGET_TESTS: MultiTargetTest[] = [
  {
    name: 'Test 1: Pharmaciens ET Infirmiers',
    query: 'Je veux toucher les pharmaciens et les infirmiers libéraux',
    expectedTargets: ['Pharmaciens', 'Médecins'],
    expectedMinSupportsPerTarget: 2
  },
  {
    name: 'Test 2: Médecins, Pharmaciens, Dentistes',
    query: 'Campagne multi-cibles : médecins généralistes, pharmaciens d\'officine et dentistes',
    expectedTargets: ['Médecins', 'Pharmaciens'],
    expectedMinSupportsPerTarget: 2
  },
  {
    name: 'Test 3: DAF et Comptables',
    query: 'Je cible les DAF et les experts-comptables',
    expectedTargets: ['Finance', 'Comptables'],
    expectedMinSupportsPerTarget: 1
  },
  {
    name: 'Test 4: Une seule cible (Médecins)',
    query: 'Supports pour médecins généralistes uniquement',
    expectedTargets: ['Médecins'],
    expectedMinSupportsPerTarget: 3
  },
  {
    name: 'Test 5: Professions libérales (multi-catégories)',
    query: 'Je veux cibler toutes les professions libérales',
    expectedTargets: ['Médecins', 'Pharmaciens', 'Juridique', 'Comptables'],
    expectedMinSupportsPerTarget: 1
  }
];

async function testTargetDetection(query: string): Promise<any> {
  try {
    const { data, error } = await supabase.rpc('extract_targets_from_brief', {
      brief_text: query
    });

    if (error) {
      console.error('   ❌ Error:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error('   ❌ Exception:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function testEdgeFunctionMultiTarget(query: string): Promise<any> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/chat-ai`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: query
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ HTTP ${response.status}:`, errorText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('   ❌ Exception:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function runMultiTargetTests() {
  console.log('================================');
  console.log('🎯 TEST SYSTÈME MULTI-CIBLES');
  console.log('================================\n');

  // Test 1: Détection de cibles SQL directe
  console.log('📊 PHASE 1: Test de détection de cibles (SQL)\n');

  for (const test of MULTI_TARGET_TESTS) {
    console.log(`🧪 ${test.name}`);
    console.log(`   Query: "${test.query}"`);
    console.log(`   Expected targets: ${test.expectedTargets.join(', ')}`);

    const targets = await testTargetDetection(test.query);

    if (!targets) {
      console.log('   ❌ ÉCHEC: Aucune cible détectée\n');
      continue;
    }

    const detectedTargetNames = targets.map((t: any) => t.target_name);
    console.log(`   ✅ Détecté ${targets.length} cibles: ${detectedTargetNames.join(', ')}`);

    // Vérifier que les cibles attendues sont présentes
    const foundExpected = test.expectedTargets.filter(expected =>
      detectedTargetNames.some((detected: string) => detected.includes(expected))
    );

    if (foundExpected.length > 0) {
      console.log(`   ✓ Match: ${foundExpected.join(', ')}`);
    }

    // Afficher les boosts
    targets.forEach((t: any) => {
      console.log(`     • ${t.target_name}: boost ${t.boost_score}, keywords: ${t.keywords_matched.join(', ')}`);
    });

    console.log('');
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Test 2: Edge Function complète
  console.log('\n🌐 PHASE 2: Test Edge Function avec mode multi-cibles\n');

  const edgeTestCases = MULTI_TARGET_TESTS.slice(0, 3); // Limiter à 3 pour gagner du temps

  for (const test of edgeTestCases) {
    console.log(`🧪 ${test.name}`);
    console.log(`   Query: "${test.query}"`);

    const startTime = Date.now();
    const result = await testEdgeFunctionMultiTarget(test.query);
    const duration = Date.now() - startTime;

    if (!result) {
      console.log('   ❌ ÉCHEC\n');
      continue;
    }

    console.log(`   ✅ SUCCÈS (${duration}ms)`);

    const vectorResults = result.vectorResults || [];
    const message = result.message?.content || '';

    console.log(`   Supports retournés: ${vectorResults.length}`);

    // Vérifier la structure de la réponse
    const hasReformulation = message.includes('ciblez') || message.includes('Vous');
    const hasCiblesSection = message.includes('Cible') || message.includes('CIBLE');
    const hasCTA = message.includes('Souhaitez-vous générer un devis');

    console.log(`   Structure validée:`);
    console.log(`     • Reformulation: ${hasReformulation ? '✓' : '✗'}`);
    console.log(`     • Section cibles: ${hasCiblesSection ? '✓' : '✗'}`);
    console.log(`     • Call-to-Action: ${hasCTA ? '✓' : '✗'}`);

    // Vérifier qu'il n'y a pas de NaN ou de champs vides critiques
    const hasNaN = message.includes('NaN');
    const hasUndefined = message.includes('undefined');

    if (hasNaN || hasUndefined) {
      console.log(`   ⚠️  AVERTISSEMENT: Champs invalides détectés (NaN: ${hasNaN}, undefined: ${hasUndefined})`);
    } else {
      console.log(`   ✓ Aucun champ invalide (NaN, undefined)`);
    }

    console.log('');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('================================');
  console.log('✅ TESTS MULTI-CIBLES TERMINÉS');
  console.log('================================\n');
}

async function testValidationFilter() {
  console.log('🔍 PHASE 3: Test de validation cible/support\n');

  const testCases = [
    { categorie: 'Pharmaciens', lectorat: 'Pharmaciens d\'officine', target: 'Pharmaciens', expected: true },
    { categorie: 'Médecins', lectorat: 'Médecins généralistes', target: 'Médecins', expected: true },
    { categorie: 'Finance', lectorat: 'Directeurs financiers', target: 'Finance', expected: true },
    { categorie: 'Médecins', lectorat: 'Médecins', target: 'Pharmaciens', expected: false },
    { categorie: 'Dirigeants', lectorat: 'Chefs d\'entreprise', target: 'Infirmiers', expected: false },
    { categorie: null, lectorat: 'Tout public', target: 'Médecins', expected: false }
  ];

  for (const testCase of testCases) {
    try {
      const { data, error } = await supabase.rpc('validate_support_target_match', {
        support_categorie: testCase.categorie,
        support_lectorat: testCase.lectorat,
        target_category: testCase.target
      });

      const result = data === testCase.expected;
      const icon = result ? '✅' : '❌';

      console.log(`${icon} Cat: "${testCase.categorie}", Target: "${testCase.target}" → ${data} (expected: ${testCase.expected})`);
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
    }
  }

  console.log('');
}

async function main() {
  try {
    await runMultiTargetTests();
    await testValidationFilter();

    console.log('💡 Pour voir les logs de détection:');
    console.log('   SELECT * FROM target_detection_logs ORDER BY created_at DESC LIMIT 5;\n');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);

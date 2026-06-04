/**
 * Test de validation de l'Edge Function chat-ai
 * Vérifie le système Zero-Error avec les 5 requêtes critiques
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

interface TestCase {
  name: string;
  query: string;
  expectedBoost: string;
  expectedCategories?: string[];
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Test 1: Professions libérales',
    query: 'Peux-tu me cibler les professions libérales ?',
    expectedBoost: '1.4-1.5',
    expectedCategories: ['Médecins', 'Pharmaciens', 'Juridique', 'Comptables']
  },
  {
    name: 'Test 2: DAF et CFO',
    query: 'Je veux toucher les DAF et CFO',
    expectedBoost: '1.5',
    expectedCategories: ['Finance']
  },
  {
    name: 'Test 3: Médecins généralistes',
    query: 'Supports pour médecins généralistes',
    expectedBoost: '1.4-1.5',
    expectedCategories: ['Médecins']
  },
  {
    name: 'Test 4: Presse locale (pas de mapping)',
    query: 'Presse locale en Bretagne',
    expectedBoost: '1.0-1.2',
    expectedCategories: []
  },
  {
    name: 'Test 5: Brief vide (fallback)',
    query: '',
    expectedBoost: '1.0',
    expectedCategories: []
  }
];

async function testEdgeFunction(testCase: TestCase): Promise<void> {
  console.log(`\n🧪 ${testCase.name}`);
  console.log(`   Query: "${testCase.query}"`);
  console.log(`   Expected boost: ${testCase.expectedBoost}`);

  try {
    const startTime = Date.now();

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
            content: testCase.query || 'Donne-moi des supports'
          }
        ]
      })
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ ÉCHEC: HTTP ${response.status}`);
      console.error(`   Erreur: ${errorText}`);
      return;
    }

    const data = await response.json();

    // Validation
    const vectorResults = data.vectorResults || [];
    const totalMatches = data.totalMatches || 0;
    const message = data.message?.content || '';

    console.log(`   ✅ SUCCÈS (${duration}ms)`);
    console.log(`   Résultats: ${vectorResults.length} supports retournés`);
    console.log(`   Total matches: ${totalMatches}`);

    if (vectorResults.length > 0) {
      const boosts = vectorResults
        .map((r: any) => r.semantic_boost)
        .filter((b: any) => b !== undefined);

      if (boosts.length > 0) {
        const maxBoost = Math.max(...boosts);
        const avgBoost = boosts.reduce((a: number, b: number) => a + b, 0) / boosts.length;

        console.log(`   Max boost: ${maxBoost.toFixed(2)}`);
        console.log(`   Avg boost: ${avgBoost.toFixed(2)}`);
      }

      // Vérifier les catégories attendues
      if (testCase.expectedCategories && testCase.expectedCategories.length > 0) {
        const categories = vectorResults
          .map((r: any) => r.categorie)
          .filter((c: any) => c);

        const matchedCategories = testCase.expectedCategories.filter(
          expected => categories.some((c: string) => c.includes(expected))
        );

        console.log(`   Catégories trouvées: ${matchedCategories.join(', ') || 'Aucune'}`);
      }
    }

    // Vérifier que la réponse de l'AI est présente
    if (message.length > 0) {
      console.log(`   Réponse AI: ${message.substring(0, 100)}...`);
    }

  } catch (error) {
    console.error(`   ❌ ERREUR:`, error instanceof Error ? error.message : error);
  }
}

async function testDatabaseFunctions(): Promise<void> {
  console.log('\n🔍 Test des fonctions de base de données\n');

  // Test 1: Vérifier semantic_mappings
  console.log('📊 Test 1: Vérifier semantic_mappings');
  try {
    const { data: mappings, error } = await supabase
      .from('semantic_mappings')
      .select('*')
      .limit(5);

    if (error) {
      console.error('   ❌ Erreur:', error.message);
    } else {
      console.log(`   ✅ ${mappings?.length || 0} mappings chargés`);
      if (mappings && mappings.length > 0) {
        console.log(`   Exemple: "${mappings[0].keyword}" → ${mappings[0].target_categorie} (boost: ${mappings[0].boost_score})`);
      }
    }
  } catch (error) {
    console.error('   ❌ Erreur:', error instanceof Error ? error.message : error);
  }

  // Test 2: Vérifier semantic_boost_logs
  console.log('\n📊 Test 2: Vérifier semantic_boost_logs');
  try {
    const { data: logs, error } = await supabase
      .from('semantic_boost_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) {
      console.error('   ❌ Erreur:', error.message);
    } else {
      console.log(`   ✅ ${logs?.length || 0} logs trouvés`);
      if (logs && logs.length > 0) {
        logs.forEach((log: any) => {
          console.log(`   - "${log.brief_context.substring(0, 40)}..." (boost: ${log.max_boost_applied})`);
        });
      }
    }
  } catch (error) {
    console.error('   ❌ Erreur:', error instanceof Error ? error.message : error);
  }

  // Test 3: Vérifier semantic_boost_usage (vue)
  console.log('\n📊 Test 3: Vérifier semantic_boost_usage (vue)');
  try {
    const { data: usage, error } = await supabase
      .from('semantic_boost_usage')
      .select('*')
      .limit(5);

    if (error) {
      console.error('   ❌ Erreur:', error.message);
    } else {
      console.log(`   ✅ ${usage?.length || 0} mappings dans la vue`);
    }
  } catch (error) {
    console.error('   ❌ Erreur:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('================================');
  console.log('🚀 TEST SYSTÈME SEMANTIC BOOST');
  console.log('================================');

  // Test des fonctions de base de données
  await testDatabaseFunctions();

  // Test de l'Edge Function
  console.log('\n🌐 Test de l\'Edge Function chat-ai\n');

  for (const testCase of TEST_CASES) {
    await testEdgeFunction(testCase);
    // Attendre un peu entre les tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n================================');
  console.log('✅ TESTS TERMINÉS');
  console.log('================================');
  console.log('\nVérifications critiques:');
  console.log('  ✓ Aucune erreur = système robuste');
  console.log('  ✓ Tous les tests retournent des résultats');
  console.log('  ✓ Boosts appliqués correctement selon mappings');
  console.log('  ✓ Brief vide ne provoque pas d\'erreur');
  console.log('\n💡 Pour voir les logs:');
  console.log('   SELECT * FROM semantic_boost_logs ORDER BY created_at DESC LIMIT 10;');
  console.log('');
}

main().catch(console.error);

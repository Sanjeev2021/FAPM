import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { openai } from './openai-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TestQuery {
  description: string;
  query: string;
  expectedTable: string;
  minSimilarity: number;
}

const testQueries: TestQuery[] = [
  {
    description: 'Recherche de supports pour dentistes',
    query: 'supports presse pour dentistes et chirurgiens dentistes',
    expectedTable: 'supports_master',
    minSimilarity: 0.7,
  },
  {
    description: 'Recherche par canal web',
    query: 'supports avec canal web et newsletters',
    expectedTable: 'supports_master',
    minSimilarity: 0.6,
  },
  {
    description: 'Recherche de tarifs print',
    query: 'tarifs des formats print et diffusion',
    expectedTable: 'supports_variants',
    minSimilarity: 0.6,
  },
  {
    description: 'Recherche de dates de bouclage',
    query: 'dates de bouclage et planning éditorial',
    expectedTable: 'planning_kits',
    minSimilarity: 0.6,
  },
  {
    description: 'Recherche multi-tables',
    query: 'restauration collective',
    expectedTable: 'all',
    minSimilarity: 0.5,
  },
];

async function testSemanticSearch() {
  console.log('\n🧪 TEST DE RECHERCHE SÉMANTIQUE RAG\n');
  console.log('='.repeat(70));

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const test of testQueries) {
    totalTests++;
    console.log(`\n📝 Test ${totalTests}: ${test.description}`);
    console.log(`   Query: "${test.query}"`);
    console.log(`   Expected table: ${test.expectedTable}`);

    try {
      const embedding = await openai.createEmbedding(test.query);

      if (test.expectedTable === 'all') {
        const { data, error } = await supabase.rpc('match_all_tables', {
          query_embedding: embedding,
          match_threshold: test.minSimilarity,
          match_count_per_table: 3,
        });

        if (error) throw error;

        if (data && data.length > 0) {
          console.log(`   ✅ PASSED - Found ${data.length} results across all tables`);
          console.log(`   Top 3 results:`);
          data.slice(0, 3).forEach((result: any, idx: number) => {
            console.log(
              `      ${idx + 1}. [${result.source_table}] ${result.support} (similarity: ${result.similarity.toFixed(3)})`
            );
          });
          passedTests++;
        } else {
          console.log(`   ❌ FAILED - No results found`);
          failedTests++;
        }
      } else {
        let rpcFunction = '';
        switch (test.expectedTable) {
          case 'supports_master':
            rpcFunction = 'match_supports_master';
            break;
          case 'supports_variants':
            rpcFunction = 'match_supports_variants';
            break;
          case 'planning_kits':
            rpcFunction = 'match_planning_kits';
            break;
          case 'visuels':
            rpcFunction = 'match_visuels';
            break;
          case 'contacts':
            rpcFunction = 'match_contacts';
            break;
        }

        const { data, error } = await supabase.rpc(rpcFunction, {
          query_embedding: embedding,
          match_threshold: test.minSimilarity,
          match_count: 5,
        });

        if (error) throw error;

        if (data && data.length > 0) {
          const topResult = data[0];
          console.log(`   ✅ PASSED - Found ${data.length} results`);
          console.log(`   Top result:`);
          console.log(`      Support: ${topResult.support || 'N/A'}`);
          console.log(`      Similarity: ${topResult.similarity.toFixed(3)}`);
          if (topResult.categorie) console.log(`      Catégorie: ${topResult.categorie}`);
          if (topResult.canal) console.log(`      Canal: ${topResult.canal}`);
          passedTests++;
        } else {
          console.log(`   ❌ FAILED - No results found with similarity >= ${test.minSimilarity}`);
          failedTests++;
        }
      }
    } catch (error) {
      console.log(`   ❌ ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
      failedTests++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSULTATS DES TESTS');
  console.log('='.repeat(70));
  console.log(`Total tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(70) + '\n');

  if (failedTests === 0) {
    console.log('🎉 Tous les tests sont passés avec succès!\n');
  } else {
    console.log('⚠️  Certains tests ont échoué. Vérifiez que les embeddings sont générés.\n');
  }
}

async function validateEmbeddings() {
  console.log('\n🔍 VALIDATION DES EMBEDDINGS\n');
  console.log('='.repeat(70));

  const tables = [
    'new_00_supports_master',
    'new_01_supports_variants',
    'new_02_planning_kits_media',
    'new_03_visuels',
    'new_04_contacts',
  ];

  for (const table of tables) {
    const { count: totalCount } = await supabase.from(table).select('*', { count: 'exact', head: true });

    const { count: embeddedCount } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    const percentage = totalCount ? ((embeddedCount || 0) / totalCount) * 100 : 0;
    const status = percentage === 100 ? '✅' : percentage > 0 ? '⚠️ ' : '❌';

    console.log(
      `${status} ${table.padEnd(30)} ${embeddedCount || 0}/${totalCount || 0} (${percentage.toFixed(1)}%)`
    );
  }

  console.log('='.repeat(70) + '\n');
}

async function main() {
  await validateEmbeddings();
  await testSemanticSearch();
}

main().catch(console.error);

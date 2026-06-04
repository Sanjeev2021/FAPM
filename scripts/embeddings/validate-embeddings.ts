import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TableStats {
  name: string;
  total: number;
  withEmbedding: number;
  withoutEmbedding: number;
  withTextVectorise: number;
  percentage: number;
}

async function validateEmbeddings() {
  console.log('\n🔍 VALIDATION DES EMBEDDINGS - RAPPORT COMPLET\n');
  console.log('='.repeat(80));

  const tables = [
    { name: 'new_00_supports_master', display: '📋 Supports Master (PRIORITAIRE)' },
    { name: 'new_01_supports_variants', display: '📋 Supports Variants' },
    { name: 'new_02_planning_kits_media', display: '📋 Planning & Kits' },
    { name: 'new_03_visuels', display: '📋 Visuels' },
    { name: 'new_04_contacts', display: '📋 Contacts' },
  ];

  const stats: TableStats[] = [];
  let totalRecords = 0;
  let totalEmbedded = 0;

  for (const table of tables) {
    const { count: total } = await supabase.from(table.name).select('*', { count: 'exact', head: true });

    const { count: withEmbedding } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    const { count: withTextVectorise } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })
      .not('texte_vectorise', 'is', null);

    const withoutEmbedding = (total || 0) - (withEmbedding || 0);
    const percentage = total ? ((withEmbedding || 0) / total) * 100 : 0;

    stats.push({
      name: table.name,
      total: total || 0,
      withEmbedding: withEmbedding || 0,
      withoutEmbedding,
      withTextVectorise: withTextVectorise || 0,
      percentage,
    });

    totalRecords += total || 0;
    totalEmbedded += withEmbedding || 0;

    const status = percentage === 100 ? '✅' : percentage > 50 ? '⚠️ ' : '❌';
    console.log(`\n${status} ${table.display}`);
    console.log(`   Total records: ${total || 0}`);
    console.log(`   With embedding: ${withEmbedding || 0}`);
    console.log(`   Without embedding: ${withoutEmbedding}`);
    console.log(`   With texte_vectorise: ${withTextVectorise || 0}`);
    console.log(`   Progress: ${percentage.toFixed(1)}%`);

    if (percentage < 100) {
      console.log(`   ⚠️  Action requise: Lancer la génération d'embeddings pour cette table`);
    }
  }

  const globalPercentage = totalRecords ? (totalEmbedded / totalRecords) * 100 : 0;

  console.log('\n' + '='.repeat(80));
  console.log('📊 STATISTIQUES GLOBALES');
  console.log('='.repeat(80));
  console.log(`Total records dans toutes les tables: ${totalRecords.toLocaleString()}`);
  console.log(`Records avec embedding: ${totalEmbedded.toLocaleString()}`);
  console.log(`Records sans embedding: ${(totalRecords - totalEmbedded).toLocaleString()}`);
  console.log(`Progression globale: ${globalPercentage.toFixed(1)}%`);

  if (globalPercentage < 100) {
    console.log(`\n⚠️  Il reste ${totalRecords - totalEmbedded} records à vectoriser`);
    console.log(`\n📝 Pour générer les embeddings manquants:`);
    console.log(`   npm run embeddings:generate-all`);
  } else {
    console.log(`\n✅ Tous les embeddings sont générés!`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔧 VÉRIFICATION DES INDEX HNSW');
  console.log('='.repeat(80));

  const { data: indexes, error } = await supabase.rpc('exec_sql' as any, {
    sql: `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE indexname LIKE '%embedding%'
      ORDER BY tablename;
    `,
  }).catch(() => ({ data: null, error: null }));

  if (indexes && indexes.length > 0) {
    console.log(`✅ ${indexes.length} index(es) HNSW trouvé(s)`);
    indexes.forEach((idx: any) => {
      console.log(`   - ${idx.indexname} sur ${idx.tablename}`);
    });
  } else {
    console.log(`⚠️  Impossible de vérifier les index (permissions requises)`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎯 PROCHAINES ÉTAPES');
  console.log('='.repeat(80));

  if (globalPercentage < 100) {
    console.log(`1. Générer les embeddings manquants:`);
    console.log(`   npm run embeddings:generate-all`);
    console.log(`2. Valider à nouveau:`);
    console.log(`   npm run embeddings:validate`);
    console.log(`3. Tester la recherche sémantique:`);
    console.log(`   npm run embeddings:test`);
  } else {
    console.log(`1. Tester la recherche sémantique:`);
    console.log(`   npm run embeddings:test`);
    console.log(`2. Intégrer dans l'application avec src/lib/rag/vectorSearch.ts`);
    console.log(`3. Configurer le prompt RAG pour l'orchestration`);
  }

  console.log('='.repeat(80) + '\n');

  return stats;
}

validateEmbeddings().catch(console.error);

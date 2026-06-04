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

interface TableConfig {
  name: string;
  tableName: string;
  primaryKey: string;
}

const tables: TableConfig[] = [
  { name: 'Supports Master', tableName: 'new_00_supports_master', primaryKey: 'support_slug' },
  { name: 'Supports Variants', tableName: 'new_01_supports_variants', primaryKey: 'variant_slug' },
  { name: 'Planning Kits', tableName: 'new_02_planning_kits_media', primaryKey: 'id' },
  { name: 'Visuels', tableName: 'new_03_visuels', primaryKey: 'id' },
  { name: 'Contacts', tableName: 'new_04_contacts', primaryKey: 'id' },
];

async function batchUpdateEmbeddings(
  tableName: string,
  primaryKey: string,
  updates: Array<{ id: string; embedding: number[] }>,
  concurrency: number = 10
): Promise<{ success: number; errors: number }> {
  let successCount = 0;
  let errorCount = 0;

  const chunks: Array<Array<{ id: string; embedding: number[] }>> = [];
  for (let i = 0; i < updates.length; i += concurrency) {
    chunks.push(updates.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (update) => {
      try {
        const { error } = await supabase
          .from(tableName)
          .update({ embedding: JSON.stringify(update.embedding) })
          .eq(primaryKey, update.id);

        if (error) throw error;
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    });

    const results = await Promise.all(promises);
    successCount += results.filter(r => r.success).length;
    errorCount += results.filter(r => !r.success).length;

    process.stdout.write(`\r  Saved: ${successCount}/${updates.length}`);
  }

  console.log('');
  return { success: successCount, errors: errorCount };
}

async function generateEmbeddingsForTable(
  config: TableConfig,
  options: { forceRegenerate: boolean; batchSize: number }
): Promise<{ success: number; errors: number; tokens: number; cost: number }> {
  const { forceRegenerate, batchSize } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Table: ${config.name} (${config.tableName})`);
  console.log('='.repeat(60));

  let query = supabase
    .from(config.tableName)
    .select(`${config.primaryKey}, texte_vectorise, embedding`);

  if (!forceRegenerate) {
    query = query.is('embedding', null);
  }

  const { data: records, error } = await query;

  if (error) {
    console.error(`❌ Erreur lors de la récupération:`, error.message);
    return { success: 0, errors: 0, tokens: 0, cost: 0 };
  }

  if (!records || records.length === 0) {
    console.log('✅ Tous les embeddings sont déjà générés!');
    return { success: 0, errors: 0, tokens: 0, cost: 0 };
  }

  console.log(`📊 ${records.length} records à vectoriser`);

  const textsToVectorize = records.map(r => r.texte_vectorise || '');

  console.log('🔄 Génération des embeddings avec OpenAI...');

  let totalTokens = 0;
  const embeddings = await openai.createEmbeddingsBatch(
    textsToVectorize,
    batchSize,
    (completed, total, tokens) => {
      totalTokens = tokens;
      const percentage = ((completed / total) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${completed}/${total} (${percentage}%) - Tokens: ${tokens.toLocaleString()}`);
    }
  );

  const cost = openai.estimateCost(totalTokens);
  console.log(`\n✅ Embeddings générés! Tokens: ${totalTokens.toLocaleString()} - Cost: $${cost.toFixed(4)}`);

  console.log('💾 Sauvegarde dans Supabase (batch mode)...');

  const updates = records.map((record, i) => ({
    id: record[config.primaryKey],
    embedding: embeddings[i],
  }));

  const { success: successCount, errors: errorCount } = await batchUpdateEmbeddings(
    config.tableName,
    config.primaryKey,
    updates,
    50
  );

  console.log(`✅ Sauvegarde terminée! Success: ${successCount}, Errors: ${errorCount}`);

  return { success: successCount, errors: errorCount, tokens: totalTokens, cost };
}

async function generateAllEmbeddings(options: {
  forceRegenerate?: boolean;
  batchSize?: number;
  tablesFilter?: string[];
} = {}) {
  const { forceRegenerate = false, batchSize = 100, tablesFilter } = options;

  console.log('\n🚀 GÉNÉRATION DES EMBEDDINGS POUR TOUTES LES TABLES PLS\n');
  console.log('Configuration:');
  console.log(`  - Force regenerate: ${forceRegenerate}`);
  console.log(`  - Batch size: ${batchSize}`);
  console.log(`  - Tables filter: ${tablesFilter?.join(', ') || 'all'}`);
  console.log(`  - Concurrency: 50 updates simultanés (OPTIMISÉ)`);

  const tablesToProcess = tablesFilter
    ? tables.filter(t => tablesFilter.includes(t.tableName))
    : tables;

  const startTime = Date.now();
  let totalSuccess = 0;
  let totalErrors = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const table of tablesToProcess) {
    const result = await generateEmbeddingsForTable(table, { forceRegenerate, batchSize });
    totalSuccess += result.success;
    totalErrors += result.errors;
    totalTokens += result.tokens;
    totalCost += result.cost;
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ GLOBAL');
  console.log('='.repeat(60));
  console.log(`✅ Records vectorisés: ${totalSuccess}`);
  console.log(`❌ Erreurs: ${totalErrors}`);
  console.log(`🔢 Total tokens utilisés: ${totalTokens.toLocaleString()}`);
  console.log(`💰 Coût total estimé: $${totalCost.toFixed(4)}`);
  console.log(`⏱️  Durée: ${duration} minutes`);
  console.log('='.repeat(60) + '\n');
}

const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100;
const tablesArg = args.find(arg => arg.startsWith('--tables='));
const tablesFilter = tablesArg ? tablesArg.split('=')[1].split(',') : undefined;

generateAllEmbeddings({ forceRegenerate, batchSize, tablesFilter }).catch(console.error);

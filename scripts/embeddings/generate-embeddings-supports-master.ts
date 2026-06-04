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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface SupportMaster {
  support_slug: string;
  support: string;
  categorie: string | null;
  lectorat: string | null;
  canal: string | null;
  texte_vectorise: string | null;
  embedding: number[] | null;
}

async function generateEmbeddingsForSupportsMaster(options: {
  forceRegenerate?: boolean;
  batchSize?: number;
  limit?: number;
} = {}) {
  const { forceRegenerate = false, batchSize = 100, limit } = options;

  console.log('\n🚀 Génération des embeddings pour new_00_supports_master\n');
  console.log('Configuration:');
  console.log(`  - Force regenerate: ${forceRegenerate}`);
  console.log(`  - Batch size: ${batchSize}`);
  console.log(`  - Limit: ${limit || 'unlimited'}\n`);

  let query = supabase
    .from('new_00_supports_master')
    .select('support_slug, support, categorie, lectorat, canal, texte_vectorise, embedding');

  if (!forceRegenerate) {
    query = query.is('embedding', null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: records, error } = await query;

  if (error) {
    console.error('❌ Erreur lors de la récupération des données:', error);
    process.exit(1);
  }

  if (!records || records.length === 0) {
    console.log('✅ Tous les embeddings sont déjà générés!');
    return;
  }

  console.log(`📊 ${records.length} records à vectoriser\n`);

  const textsToVectorize = records.map((r: SupportMaster) => r.texte_vectorise || '');

  console.log('🔄 Génération des embeddings avec OpenAI...\n');

  let completedCount = 0;
  let totalTokens = 0;

  const embeddings = await openai.createEmbeddingsBatch(
    textsToVectorize,
    batchSize,
    (completed, total, tokens) => {
      completedCount = completed;
      totalTokens = tokens;
      const percentage = ((completed / total) * 100).toFixed(1);
      const cost = openai.estimateCost(tokens);
      console.log(`  Progress: ${completed}/${total} (${percentage}%) - Tokens: ${tokens} - Cost: $${cost.toFixed(4)}`);
    }
  );

  console.log(`\n✅ Embeddings générés avec succès!`);
  console.log(`   Total tokens: ${totalTokens}`);
  console.log(`   Estimated cost: $${openai.estimateCost(totalTokens).toFixed(4)}\n`);

  console.log('💾 Sauvegarde dans Supabase...\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const embedding = embeddings[i];

    const { error: updateError } = await supabase
      .from('new_00_supports_master')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('support_slug', record.support_slug);

    if (updateError) {
      console.error(`❌ Error updating ${record.support_slug}:`, updateError.message);
      errorCount++;
    } else {
      successCount++;
      if (successCount % 50 === 0) {
        console.log(`  Saved: ${successCount}/${records.length}`);
      }
    }
  }

  console.log('\n✅ Sauvegarde terminée!');
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);

  if (errorCount > 0) {
    console.log('⚠️  Some records failed to update. Check logs above for details.\n');
  }
}

const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

generateEmbeddingsForSupportsMaster({ forceRegenerate, limit }).catch(console.error);

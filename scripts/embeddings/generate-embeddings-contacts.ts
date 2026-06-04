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

async function generateEmbeddingsForContacts(options: {
  forceRegenerate?: boolean;
  batchSize?: number;
  limit?: number;
} = {}) {
  const { forceRegenerate = false, batchSize = 100, limit } = options;

  console.log('\n🚀 Génération des embeddings pour new_04_contacts\n');

  let query = supabase
    .from('new_04_contacts')
    .select('id, texte_vectorise, embedding');

  if (!forceRegenerate) {
    query = query.is('embedding', null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: records, error } = await query;

  if (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }

  if (!records || records.length === 0) {
    console.log('✅ Tous les embeddings sont déjà générés!');
    return;
  }

  console.log(`📊 ${records.length} records à vectoriser\n`);

  const textsToVectorize = records.map(r => r.texte_vectorise || '');

  console.log('🔄 Génération des embeddings...\n');

  let totalTokens = 0;
  const embeddings = await openai.createEmbeddingsBatch(
    textsToVectorize,
    batchSize,
    (completed, total, tokens) => {
      totalTokens = tokens;
      const percentage = ((completed / total) * 100).toFixed(1);
      console.log(`  Progress: ${completed}/${total} (${percentage}%) - Cost: $${openai.estimateCost(tokens).toFixed(4)}`);
    }
  );

  console.log(`\n✅ Embeddings générés! Cost: $${openai.estimateCost(totalTokens).toFixed(4)}\n`);
  console.log('💾 Sauvegarde...\n');

  let successCount = 0;
  for (let i = 0; i < records.length; i++) {
    const { error: updateError } = await supabase
      .from('new_04_contacts')
      .update({ embedding: JSON.stringify(embeddings[i]) })
      .eq('id', records[i].id);

    if (!updateError) {
      successCount++;
      if (successCount % 50 === 0) {
        console.log(`  Saved: ${successCount}/${records.length}`);
      }
    }
  }

  console.log(`\n✅ Terminé! ${successCount} records sauvegardés\n`);
}

const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

generateEmbeddingsForContacts({ forceRegenerate, limit }).catch(console.error);

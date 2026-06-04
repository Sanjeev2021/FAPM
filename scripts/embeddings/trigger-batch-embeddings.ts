import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const force = args.includes('--force');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100;
const tablesArg = args.find(arg => arg.startsWith('--tables='));
const tables = tablesArg ? tablesArg.split('=')[1].split(',') : undefined;

const url = `${SUPABASE_URL}/functions/v1/generate-batch-embeddings`;

console.log('\n🚀 Triggering batch embedding generation...\n');
console.log(`  URL:        ${url}`);
console.log(`  Force:      ${force}`);
console.log(`  Batch size: ${batchSize}`);
console.log(`  Tables:     ${tables?.join(', ') || 'all'}`);
console.log('');

const body: Record<string, unknown> = { force, batchSize };
if (tables) body.tables = tables;

const start = Date.now();

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`❌ Error ${response.status}:`, data.error || data);
    process.exit(1);
  }

  // Print results
  console.log('='.repeat(60));
  console.log('📊 RESULTS');
  console.log('='.repeat(60));

  if (data.tables) {
    for (const t of data.tables) {
      const status = t.errors > 0 ? '⚠️' : t.records === 0 ? '✅' : '✅';
      console.log(`\n  ${status} ${t.table}`);
      if (t.records === 0) {
        console.log('     Already up to date');
      } else {
        console.log(`     Records: ${t.records} | Success: ${t.success} | Errors: ${t.errors}`);
        console.log(`     Tokens: ${t.tokens.toLocaleString()} | Cost: ${t.cost} | Duration: ${t.durationMs}ms`);
      }
    }
  }

  if (data.summary) {
    const s = data.summary;
    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Records:  ${s.totalSuccess} success / ${s.totalErrors} errors`);
    console.log(`  Tokens:   ${s.totalTokens.toLocaleString()}`);
    console.log(`  Cost:     ${s.totalCost}`);
    console.log(`  Duration: ${s.durationSeconds}s (server) / ${((Date.now() - start) / 1000).toFixed(1)}s (total)`);
  }

  console.log('='.repeat(60) + '\n');
} catch (err) {
  console.error('❌ Request failed:', (err as Error).message);
  process.exit(1);
}

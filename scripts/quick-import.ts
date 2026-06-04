import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Make sure .env file exists.');
  console.error(`   SUPABASE_URL: ${SUPABASE_URL ? 'Found' : 'Missing'}`);
  console.error(`   SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? 'Found' : 'Missing'}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function parseCSV(content: string): any[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;

    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });
    data.push(row);
  }

  return data;
}

async function importData() {
  console.log('\n🚀 Quick Import Started\n');

  const csvPath = resolve(__dirname, 'pls-data/new_01_supports_variants-vue_leo.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const data = parseCSV(content);

  console.log(`📊 Found ${data.length} rows\n`);

  let count = 0;

  for (let i = 0; i < Math.min(data.length, 50); i++) {
    const row = data[i];

    const variant = {
      variant_slug: row.variant_slug || `variant_${Date.now()}_${i}`,
      channel_slug: row.Canal?.toLowerCase() === 'print' ? 'print' :
                    row.Canal?.toLowerCase() === 'web' ? 'web' :
                    row.Canal?.toLowerCase() === 'nl' ? 'email' : 'print',
      support_name: row.support || 'Unknown',
      format_name: row.format_print || 'Standard',
      dimensions: row.format_print,
      technical_specs: {},
      pricing: {
        gross: row.tarif_brut,
        net: row.tarif_net
      },
      metadata: {
        periodicity: row.periodicite_print,
        circulation: row.diffusion_print,
        web_visits: row['Visites par mois Web'],
        page_views: row['Pages vues par mois Web']
      }
    };

    const { error } = await supabase
      .from('press_support_variants')
      .upsert(variant, { onConflict: 'variant_slug' });

    if (error && !error.message.includes('violates row-level security')) {
      console.log(`❌ Row ${i}: ${error.message}`);
    } else {
      count++;
      if (count % 10 === 0) {
        console.log(`✅ Imported ${count} records...`);
      }
    }
  }

  console.log(`\n✅ Import complete: ${count} records imported\n`);
}

importData().catch(console.error);

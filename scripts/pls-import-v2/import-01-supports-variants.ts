import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SupportVariantRow {
  variant_slug: string;
  support: string;
  support_slug: string;
  Canal: string;
  periodicite_print: string;
  diffusion_print: string;
  format_print: string;
  'Visites par mois Web': string;
  'Pages vues par mois Web': string;
  "Nombre d'envois NL": string;
  tarif_brut: string;
  tarif_net: string;
}

function parseCSV(content: string): SupportVariantRow[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: SupportVariantRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    if (values.length >= headers.length) {
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      data.push(row);
    }
  }

  return data;
}

async function importSupportsVariants(dryRun: boolean = false) {
  console.log('\n🚀 Import Supports Variants Started\n');

  const csvPath = resolve(__dirname, '../pls-data/new_01_supports_variants-vue_leo.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const data = parseCSV(content);

  console.log(`📊 Found ${data.length} variants records\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - Preview first 3 records:\n');
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const parseInteger = (value: string): number | null => {
      if (!value || value.trim() === '') return null;
      const parsed = parseInt(value.replace(/\s/g, ''), 10);
      return isNaN(parsed) ? null : parsed;
    };

    const record = {
      variant_slug: row.variant_slug,
      support: row.support,
      support_slug: row.support_slug || null,
      canal: row.Canal || null,
      periodicite_print: row.periodicite_print || null,
      diffusion_print: parseInteger(row.diffusion_print),
      format_print: row.format_print || null,
      visites_par_mois_web: parseInteger(row['Visites par mois Web']),
      pages_vues_par_mois_web: parseInteger(row['Pages vues par mois Web']),
      nombre_envois_nl: parseInteger(row["Nombre d'envois NL"]),
      tarif_brut: row.tarif_brut || null,
      tarif_net: row.tarif_net || null
    };

    const { error } = await supabase
      .from('new_01_supports_variants')
      .upsert(record, { onConflict: 'variant_slug' });

    if (error) {
      console.log(`❌ Row ${i + 1} (${record.variant_slug}): ${error.message}`);
      errorCount++;
    } else {
      successCount++;
      if (successCount % 50 === 0) {
        console.log(`✅ Imported ${successCount}/${data.length} records...`);
      }
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   - ${successCount} records imported successfully`);
  console.log(`   - ${errorCount} errors\n`);
}

const dryRun = process.argv.includes('--dry-run');
importSupportsVariants(dryRun).catch(console.error);

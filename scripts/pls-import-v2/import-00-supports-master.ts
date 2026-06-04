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

interface SupportMasterRow {
  support: string;
  support_slug: string;
  categorie: string;
  lectorat: string;
  canal: string;
  new_01_supports_variants_2: string;
}

function parseCSV(content: string): SupportMasterRow[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: SupportMasterRow[] = [];

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

async function importSupportsMaster(dryRun: boolean = false) {
  console.log('\n🚀 Import Supports Master Started\n');

  const csvPath = resolve(__dirname, '../pls-data/new_00_supports_master-vue_leo.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const data = parseCSV(content);

  console.log(`📊 Found ${data.length} supports master records\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - Preview first 3 records:\n');
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const record = {
      support_slug: row.support_slug,
      support: row.support,
      categorie: row.categorie || null,
      lectorat: row.lectorat || null,
      canal: row.canal || null,
      new_01_supports_variants_2: row['NEW_01_Supports_Variants 2'] || row.new_01_supports_variants_2 || null
    };

    const { error } = await supabase
      .from('new_00_supports_master')
      .upsert(record, { onConflict: 'support_slug' });

    if (error) {
      console.log(`❌ Row ${i + 1} (${record.support_slug}): ${error.message}`);
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
importSupportsMaster(dryRun).catch(console.error);

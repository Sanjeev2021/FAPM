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

interface VisuelRow {
  variant_slug: string;
  support: string;
  canal: string;
  fichier_integre: string;
  fichier_url: string;
  type_de_format: string;
  notes: string;
}

function parseCSV(content: string): VisuelRow[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: VisuelRow[] = [];

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

async function importVisuels(dryRun: boolean = false) {
  console.log('\n🚀 Import Visuels Started\n');

  const csvPath = resolve(__dirname, '../pls-data/new_03_visuels-vue_leo.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const data = parseCSV(content);

  console.log(`📊 Found ${data.length} visuels records\n`);

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
      variant_slug: row.variant_slug || null,
      support: row.support || null,
      canal: row.canal || null,
      fichier_integre: row.fichier_integre || null,
      fichier_url: row.fichier_url || null,
      type_de_format: row.type_de_format || null,
      notes: row.notes || null
    };

    const { error } = await supabase
      .from('new_03_visuels')
      .insert(record);

    if (error) {
      console.log(`❌ Row ${i + 1}: ${error.message}`);
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
importVisuels(dryRun).catch(console.error);

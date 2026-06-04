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

interface PlanningKitRow {
  variant_slug: string;
  support: string;
  canal: string;
  type: string;
  date: string;
  periodicite: string;
  specs_techniques: string;
  notes: string;
}

function parseCSV(content: string): PlanningKitRow[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: PlanningKitRow[] = [];

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

async function importPlanningKits(dryRun: boolean = false) {
  console.log('\n🚀 Import Planning Kits Started\n');

  const csvPath = resolve(__dirname, '../pls-data/new_02_planning_kits_media-vue_leo.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const data = parseCSV(content);

  console.log(`📊 Found ${data.length} planning kits records\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - Preview first 3 records:\n');
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const convertDateToISO = (dateStr: string): string | null => {
      if (!dateStr || dateStr.trim() === '') return null;
      try {
        const parts = dateStr.trim().split('/');
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        if (year < 100) year += 2000;
        // Validate the date is real (e.g., reject Feb 29 in non-leap years)
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      } catch {
        return null;
      }
    };

    const record = {
      variant_slug: row.variant_slug || null,
      support: row.support || null,
      canal: row.canal || null,
      type: row.type || null,
      date_supabase: convertDateToISO(row.date),
      periodicite: row.periodicite || null,
      specs_techniques: row.specs_techniques || null,
      notes: row.notes || null
    };

    const { error } = await supabase
      .from('new_02_planning_kits_media')
      .insert(record);

    if (error) {
      console.log(`❌ Row ${i + 1}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
      if (successCount % 100 === 0) {
        console.log(`✅ Imported ${successCount}/${data.length} records...`);
      }
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   - ${successCount} records imported successfully`);
  console.log(`   - ${errorCount} errors\n`);
}

const dryRun = process.argv.includes('--dry-run');
importPlanningKits(dryRun).catch(console.error);

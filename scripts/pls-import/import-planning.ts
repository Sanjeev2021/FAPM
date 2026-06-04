import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface PlanningRow {
  variant_id: string;
  publication_date: string;
  booking_deadline?: string;
  material_deadline?: string;
  status: 'available' | 'limited' | 'sold_out' | 'closed';
  slots_total?: number;
  slots_booked?: number;
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'one_time';
  notes?: string;
  user_id?: string;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseInteger(value: string): number | undefined {
  if (!value || value === '') return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

async function importPlanning(csvPath: string, dryRun: boolean = false): Promise<void> {
  console.log('\n🔵 Starting planning import...');
  console.log(`📁 Reading from: ${csvPath}`);
  console.log(`🔍 Dry run: ${dryRun ? 'YES' : 'NO'}\n`);

  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    console.log('⚠️  CSV file is empty');
    return;
  }

  const headers = parseCSVLine(lines[0]);
  console.log(`📋 Headers: ${headers.join(', ')}`);
  console.log(`📊 Found ${lines.length - 1} rows to import\n`);

  const planningItems: PlanningRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length !== headers.length) {
      errors.push(`Line ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
      continue;
    }

    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    if (!row.variant_id || !row.publication_date || !row.status) {
      errors.push(`Line ${i + 1}: Missing required fields`);
      continue;
    }

    if (!['available', 'limited', 'sold_out', 'closed'].includes(row.status)) {
      errors.push(`Line ${i + 1}: Invalid status "${row.status}"`);
      continue;
    }

    if (row.periodicity && !['daily', 'weekly', 'monthly', 'quarterly', 'one_time'].includes(row.periodicity)) {
      errors.push(`Line ${i + 1}: Invalid periodicity "${row.periodicity}"`);
      continue;
    }

    const planning: PlanningRow = {
      variant_id: row.variant_id,
      publication_date: row.publication_date,
      booking_deadline: row.booking_deadline || undefined,
      material_deadline: row.material_deadline || undefined,
      status: row.status,
      slots_total: parseInteger(row.slots_total),
      slots_booked: parseInteger(row.slots_booked),
      periodicity: row.periodicity || undefined,
      notes: row.notes || undefined,
      user_id: row.user_id || undefined,
    };

    planningItems.push(planning);
  }

  if (errors.length > 0) {
    console.log('⚠️  Validation errors:\n');
    errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }

  console.log(`✅ Validated ${planningItems.length} planning entries`);

  if (dryRun) {
    console.log('\n📝 Dry run - showing first 3 planning entries:\n');
    planningItems.slice(0, 3).forEach((p, i) => {
      console.log(`${i + 1}. Variant: ${p.variant_id}`);
      console.log(`   Publication: ${p.publication_date}`);
      console.log(`   Status: ${p.status}`);
      console.log(`   Slots: ${p.slots_booked || 0}/${p.slots_total || 'unlimited'}`);
      console.log('');
    });
    console.log('✅ Dry run complete - no data inserted\n');
    return;
  }

  console.log('\n💾 Inserting planning entries into database...');

  let successCount = 0;
  let errorCount = 0;

  for (const planning of planningItems) {
    const { error } = await supabase
      .from('press_support_planning')
      .insert(planning);

    if (error) {
      console.log(`❌ Error inserting planning for variant ${planning.variant_id}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

const csvPath = resolve(__dirname, '../pls-data/planning.csv');
const dryRun = process.argv.includes('--dry-run');

importPlanning(csvPath, dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });

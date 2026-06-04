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

interface KitRow {
  kit_slug: string;
  kit_name: string;
  description?: string;
  variant_ids: string[];
  pricing?: Record<string, any>;
  terms?: string;
  is_active?: boolean;
  metadata?: Record<string, any>;
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

function parseJSON(value: string): any {
  if (!value || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseVariantIds(value: string): string[] {
  if (!value || value === '') return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
  }

  return value.split(',').map(id => id.trim()).filter(id => id);
}

function parseBoolean(value: string): boolean {
  if (!value || value === '') return true;
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

async function importKits(csvPath: string, dryRun: boolean = false): Promise<void> {
  console.log('\n🔵 Starting kits import...');
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

  const kits: KitRow[] = [];
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

    if (!row.kit_slug || !row.kit_name || !row.variant_ids) {
      errors.push(`Line ${i + 1}: Missing required fields`);
      continue;
    }

    const variantIds = parseVariantIds(row.variant_ids);

    if (variantIds.length === 0) {
      errors.push(`Line ${i + 1}: variant_ids must contain at least one variant`);
      continue;
    }

    const kit: KitRow = {
      kit_slug: row.kit_slug,
      kit_name: row.kit_name,
      description: row.description || undefined,
      variant_ids: variantIds,
      pricing: parseJSON(row.pricing),
      terms: row.terms || undefined,
      is_active: parseBoolean(row.is_active),
      metadata: parseJSON(row.metadata),
      user_id: row.user_id || undefined,
    };

    kits.push(kit);
  }

  if (errors.length > 0) {
    console.log('⚠️  Validation errors:\n');
    errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }

  console.log(`✅ Validated ${kits.length} kits`);

  if (dryRun) {
    console.log('\n📝 Dry run - showing first 3 kits:\n');
    kits.slice(0, 3).forEach((k, i) => {
      console.log(`${i + 1}. ${k.kit_slug}`);
      console.log(`   Name: ${k.kit_name}`);
      console.log(`   Variants: ${k.variant_ids.length} included`);
      console.log(`   Active: ${k.is_active}`);
      console.log('');
    });
    console.log('✅ Dry run complete - no data inserted\n');
    return;
  }

  console.log('\n💾 Inserting kits into database...');

  let successCount = 0;
  let errorCount = 0;

  for (const kit of kits) {
    const { error } = await supabase
      .from('press_support_kits')
      .insert(kit);

    if (error) {
      console.log(`❌ Error inserting ${kit.kit_slug}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

const csvPath = resolve(__dirname, '../pls-data/kits.csv');
const dryRun = process.argv.includes('--dry-run');

importKits(csvPath, dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });

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

interface VariantRow {
  variant_slug: string;
  channel_slug: 'print' | 'web' | 'email' | 'social';
  support_name: string;
  format_name: string;
  dimensions?: string;
  technical_specs?: Record<string, any>;
  pricing?: Record<string, any>;
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

async function importVariants(csvPath: string, dryRun: boolean = false): Promise<void> {
  console.log('\n🔵 Starting variants import...');
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

  const variants: VariantRow[] = [];
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

    if (!row.variant_slug || !row.channel_slug || !row.support_name || !row.format_name) {
      errors.push(`Line ${i + 1}: Missing required fields`);
      continue;
    }

    if (!['print', 'web', 'email', 'social'].includes(row.channel_slug)) {
      errors.push(`Line ${i + 1}: Invalid channel_slug "${row.channel_slug}"`);
      continue;
    }

    const variant: VariantRow = {
      variant_slug: row.variant_slug,
      channel_slug: row.channel_slug,
      support_name: row.support_name,
      format_name: row.format_name,
      dimensions: row.dimensions || undefined,
      technical_specs: parseJSON(row.technical_specs),
      pricing: parseJSON(row.pricing),
      metadata: parseJSON(row.metadata),
      user_id: row.user_id || undefined,
    };

    variants.push(variant);
  }

  if (errors.length > 0) {
    console.log('⚠️  Validation errors:\n');
    errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }

  console.log(`✅ Validated ${variants.length} variants`);

  if (dryRun) {
    console.log('\n📝 Dry run - showing first 3 variants:\n');
    variants.slice(0, 3).forEach((v, i) => {
      console.log(`${i + 1}. ${v.variant_slug}`);
      console.log(`   Channel: ${v.channel_slug}`);
      console.log(`   Support: ${v.support_name}`);
      console.log(`   Format: ${v.format_name}`);
      console.log('');
    });
    console.log('✅ Dry run complete - no data inserted\n');
    return;
  }

  console.log('\n💾 Inserting variants into database...');

  let successCount = 0;
  let errorCount = 0;

  for (const variant of variants) {
    const { error } = await supabase
      .from('press_support_variants')
      .insert(variant);

    if (error) {
      console.log(`❌ Error inserting ${variant.variant_slug}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

const csvPath = resolve(__dirname, '../pls-data/variants.csv');
const dryRun = process.argv.includes('--dry-run');

importVariants(csvPath, dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });

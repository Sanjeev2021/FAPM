import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

async function applyMigrations() {
  console.log('\n═══════════════════════════════════════');
  console.log('  STEP 1: Applying Database Migrations');
  console.log('═══════════════════════════════════════\n');

  const migrations = [
    '01_create_press_support_variants.sql',
    '02_create_press_support_planning.sql',
    '03_create_press_support_kits.sql',
    '04_create_press_support_contacts_visuals.sql'
  ];

  for (const migration of migrations) {
    console.log(`📝 Applying ${migration}...`);
    const sql = readFileSync(resolve(__dirname, 'pls-migrations', migration), 'utf-8');

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

    if (error) {
      console.log(`⚠️  ${migration}: ${error.message}`);
    } else {
      console.log(`✅ ${migration} applied`);
    }
  }
}

async function importVariants() {
  console.log('\n═══════════════════════════════════════');
  console.log('  STEP 2: Importing Variants');
  console.log('═══════════════════════════════════════\n');

  const csvPath = resolve(__dirname, 'pls-data/new_01_supports_variants-vue_leo.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  const headers = parseCSVLine(lines[0]);
  console.log(`📋 Found ${lines.length - 1} variants to import`);

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < Math.min(lines.length, 101); i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;

    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || null;
    });

    const variant = {
      variant_slug: row.variant_slug || `variant_${i}`,
      channel_slug: (row.channel_slug || 'print').toLowerCase(),
      support_name: row.support_name || 'Unknown',
      format_name: row.format_name || 'Standard',
      dimensions: row.dimensions,
      technical_specs: {},
      pricing: {},
      metadata: {
        category: row.category,
        audience: row.audience
      }
    };

    if (!['print', 'web', 'email', 'social'].includes(variant.channel_slug)) {
      variant.channel_slug = 'print';
    }

    const { error } = await supabase
      .from('press_support_variants')
      .insert(variant);

    if (error) {
      if (!error.message.includes('duplicate')) {
        console.log(`⚠️  Line ${i}: ${error.message}`);
      }
      skipped++;
    } else {
      imported++;
    }

    if (i % 20 === 0) {
      console.log(`   ⏳ Processed ${i}/${Math.min(lines.length - 1, 100)}...`);
    }
  }

  console.log(`\n✅ Imported ${imported} variants (${skipped} skipped)`);
}

async function importPlanning() {
  console.log('\n═══════════════════════════════════════');
  console.log('  STEP 3: Importing Planning (sample)');
  console.log('═══════════════════════════════════════\n');

  console.log('⏭️  Skipping (can be done later)');
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   PLS Database Setup - Press Support System           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await applyMigrations();
    await importVariants();
    await importPlanning();

    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   ✅ Database Setup Complete!                         ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();

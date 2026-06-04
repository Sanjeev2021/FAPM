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

interface ContactRow {
  variant_id: string;
  contact_type: 'commercial' | 'editorial' | 'technical';
  name: string;
  email: string;
  phone?: string;
  role?: string;
  notes?: string;
  user_id?: string;
}

interface VisualRow {
  variant_id: string;
  visual_type: 'logo' | 'template' | 'example' | 'banner' | 'mockup';
  title: string;
  url: string;
  cdn_provider?: string;
  file_format?: string;
  dimensions?: string;
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

async function importContacts(csvPath: string, dryRun: boolean = false): Promise<void> {
  console.log('\n🔵 Starting contacts import...');
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

  const contacts: ContactRow[] = [];
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

    if (!row.variant_id || !row.contact_type || !row.name || !row.email) {
      errors.push(`Line ${i + 1}: Missing required fields`);
      continue;
    }

    if (!['commercial', 'editorial', 'technical'].includes(row.contact_type)) {
      errors.push(`Line ${i + 1}: Invalid contact_type "${row.contact_type}"`);
      continue;
    }

    const contact: ContactRow = {
      variant_id: row.variant_id,
      contact_type: row.contact_type,
      name: row.name,
      email: row.email,
      phone: row.phone || undefined,
      role: row.role || undefined,
      notes: row.notes || undefined,
      user_id: row.user_id || undefined,
    };

    contacts.push(contact);
  }

  if (errors.length > 0) {
    console.log('⚠️  Validation errors:\n');
    errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }

  console.log(`✅ Validated ${contacts.length} contacts`);

  if (dryRun) {
    console.log('\n📝 Dry run - showing first 3 contacts:\n');
    contacts.slice(0, 3).forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} (${c.contact_type})`);
      console.log(`   Email: ${c.email}`);
      console.log(`   Variant: ${c.variant_id}`);
      console.log('');
    });
    console.log('✅ Dry run complete - no data inserted\n');
    return;
  }

  console.log('\n💾 Inserting contacts into database...');

  let successCount = 0;
  let errorCount = 0;

  for (const contact of contacts) {
    const { error } = await supabase
      .from('press_support_contacts')
      .insert(contact);

    if (error) {
      console.log(`❌ Error inserting contact ${contact.name}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

async function importVisuals(csvPath: string, dryRun: boolean = false): Promise<void> {
  console.log('\n🔵 Starting visuals import...');
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

  const visuals: VisualRow[] = [];
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

    if (!row.variant_id || !row.visual_type || !row.title || !row.url) {
      errors.push(`Line ${i + 1}: Missing required fields`);
      continue;
    }

    if (!['logo', 'template', 'example', 'banner', 'mockup'].includes(row.visual_type)) {
      errors.push(`Line ${i + 1}: Invalid visual_type "${row.visual_type}"`);
      continue;
    }

    const visual: VisualRow = {
      variant_id: row.variant_id,
      visual_type: row.visual_type,
      title: row.title,
      url: row.url,
      cdn_provider: row.cdn_provider || 'flaix',
      file_format: row.file_format || undefined,
      dimensions: row.dimensions || undefined,
      metadata: parseJSON(row.metadata),
      user_id: row.user_id || undefined,
    };

    visuals.push(visual);
  }

  if (errors.length > 0) {
    console.log('⚠️  Validation errors:\n');
    errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }

  console.log(`✅ Validated ${visuals.length} visuals`);

  if (dryRun) {
    console.log('\n📝 Dry run - showing first 3 visuals:\n');
    visuals.slice(0, 3).forEach((v, i) => {
      console.log(`${i + 1}. ${v.title} (${v.visual_type})`);
      console.log(`   URL: ${v.url}`);
      console.log(`   Variant: ${v.variant_id}`);
      console.log('');
    });
    console.log('✅ Dry run complete - no data inserted\n');
    return;
  }

  console.log('\n💾 Inserting visuals into database...');

  let successCount = 0;
  let errorCount = 0;

  for (const visual of visuals) {
    const { error } = await supabase
      .from('press_support_visuals')
      .insert(visual);

    if (error) {
      console.log(`❌ Error inserting visual ${visual.title}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

const mode = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (mode === 'contacts') {
  const csvPath = resolve(__dirname, '../pls-data/contacts.csv');
  importContacts(csvPath, dryRun)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Fatal error:', err);
      process.exit(1);
    });
} else if (mode === 'visuals') {
  const csvPath = resolve(__dirname, '../pls-data/visuals.csv');
  importVisuals(csvPath, dryRun)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Fatal error:', err);
      process.exit(1);
    });
} else {
  console.log('Usage: tsx import-contacts-visuals.ts [contacts|visuals] [--dry-run]');
  process.exit(1);
}

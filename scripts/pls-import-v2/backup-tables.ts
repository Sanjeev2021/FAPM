import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BACKUP_DIR = resolve(__dirname, '../pls-data/backup_2026-03-18');

async function backupTable(table: string) {
  const allRows: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`❌ ${table}: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const path = resolve(BACKUP_DIR, `${table}.json`);
  writeFileSync(path, JSON.stringify(allRows, null, 2));
  console.log(`✅ ${table}: ${allRows.length} rows backed up`);
}

async function main() {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const tables = [
    'new_00_supports_master',
    'new_01_supports_variants',
    'new_02_planning_kits_media',
    'new_03_visuels',
    'new_04_contacts',
  ];

  for (const table of tables) {
    await backupTable(table);
  }
  console.log('\n✅ All backups complete');
}

main().catch(console.error);

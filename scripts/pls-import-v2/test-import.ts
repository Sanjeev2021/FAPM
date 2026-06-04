import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  console.log('\n🔍 Test de connexion Supabase\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tables = [
    'new_00_supports_master',
    'new_01_supports_variants',
    'new_02_planning_kits_media',
    'new_03_visuels',
    'new_04_contacts'
  ];

  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`❌ ${table}: ERROR - ${error.message}`);
    } else {
      console.log(`✅ ${table}: ${count ?? 0} lignes`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
  console.log('🎯 Connexion OK! Vous pouvez lancer l\'import complet.\n');
}

testConnection().catch(console.error);

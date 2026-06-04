import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createTables() {
  console.log('\n🗄️  Creating Database Tables...\n');

  const sql = `
-- Create press_support_variants table
CREATE TABLE IF NOT EXISTS press_support_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_slug text UNIQUE NOT NULL,
  channel_slug text NOT NULL CHECK (channel_slug IN ('print', 'web', 'email', 'social')),
  support_name text NOT NULL,
  format_name text NOT NULL,
  dimensions text,
  technical_specs jsonb DEFAULT '{}'::jsonb,
  pricing jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_press_support_variants_channel ON press_support_variants(channel_slug);
CREATE INDEX IF NOT EXISTS idx_press_support_variants_support_name ON press_support_variants(support_name);
CREATE INDEX IF NOT EXISTS idx_press_support_variants_user_id ON press_support_variants(user_id);

-- Enable RLS
ALTER TABLE press_support_variants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view all variants" ON press_support_variants;
DROP POLICY IF EXISTS "Authenticated users can create variants" ON press_support_variants;
DROP POLICY IF EXISTS "Users can update own variants" ON press_support_variants;
DROP POLICY IF EXISTS "Users can delete own variants" ON press_support_variants;

-- CREATE policies
CREATE POLICY "Authenticated users can view all variants"
  ON press_support_variants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create variants"
  ON press_support_variants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own variants"
  ON press_support_variants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own variants"
  ON press_support_variants
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
`;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.error('❌ Error:', error.message);

      console.log('\n📝 Trying alternative method...\n');

      const statements = sql.split(';').filter(s => s.trim());

      for (const statement of statements) {
        if (!statement.trim()) continue;

        try {
          await supabase.rpc('exec_sql', { sql: statement });
          console.log('✅ Executed statement');
        } catch (e: any) {
          console.log(`⚠️  ${e.message}`);
        }
      }
    } else {
      console.log('✅ Tables created successfully');
    }
  } catch (err: any) {
    console.error('❌ Failed:', err.message);
  }
}

createTables();

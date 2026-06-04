/*
  # Create press_support_variants table - Multi-channel Press Support Architecture

  ## Overview
  This migration creates the foundational table for the multi-channel press support system.
  Each variant represents a specific advertising format for a specific channel (print/web/email/social).

  ## New Tables
  - `press_support_variants`
    - `id` (uuid, primary key) - Unique identifier
    - `variant_slug` (text, unique, not null) - Unique identifier combining support, channel, and format
      Example: "le_moniteur_dentaire_2025_print_full_page"
    - `channel_slug` (text, not null) - Channel type: "print", "web", "email", "social"
    - `support_name` (text, not null) - Name of the press support (e.g., "Le Moniteur Dentaire 2025")
    - `format_name` (text, not null) - Format name (e.g., "Page entière", "Bannière 728x90")
    - `dimensions` (text) - Physical or digital dimensions (e.g., "210x297mm", "728x90px")
    - `technical_specs` (jsonb) - Technical specifications (resolution, file formats, color profiles, etc.)
    - `pricing` (jsonb) - Pricing structure (base_price, currency, discounts, etc.)
    - `metadata` (jsonb) - Additional metadata (circulation, audience, targeting, etc.)
    - `user_id` (uuid, foreign key) - Reference to the user who created this variant
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on press_support_variants table
  - Authenticated users can read all variants (needed for browsing catalog)
  - Only the creator can update or delete their variants
  - Any authenticated user can insert new variants

  ## Indexes
  - Primary key on id
    - Unique index on variant_slug
  - Index on channel_slug for filtering by channel
  - Index on support_name for searching by support
  - Index on user_id for filtering user's variants
*/

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

-- Enable Row Level Security
ALTER TABLE press_support_variants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view all variants" ON press_support_variants;
DROP POLICY IF EXISTS "Authenticated users can create variants" ON press_support_variants;
DROP POLICY IF EXISTS "Users can update own variants" ON press_support_variants;
DROP POLICY IF EXISTS "Users can delete own variants" ON press_support_variants;

-- RLS Policies for press_support_variants

-- SELECT: All authenticated users can view all variants (catalog browsing)
CREATE POLICY "Authenticated users can view all variants"
  ON press_support_variants
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Any authenticated user can create new variants
CREATE POLICY "Authenticated users can create variants"
  ON press_support_variants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the creator can update their variants
CREATE POLICY "Users can update own variants"
  ON press_support_variants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the creator can delete their variants
CREATE POLICY "Users can delete own variants"
  ON press_support_variants
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

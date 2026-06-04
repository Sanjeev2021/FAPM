/*
  # Create press_support_kits table - Media Kits & Package Offers

  ## Overview
  This migration creates the kits table for managing packaged offers that bundle
  multiple variants together (e.g., "Print + Web Package", "Social Media Kit").

  ## New Tables
  - `press_support_kits`
    - `id` (uuid, primary key) - Unique identifier
    - `kit_slug` (text, unique, not null) - Unique identifier for the kit
      Example: "le_moniteur_dentaire_2025_print_web_package"
    - `kit_name` (text, not null) - Display name of the kit
    - `description` (text) - Detailed description of the kit offering
    - `variant_ids` (uuid[], not null) - Array of variant IDs included in this kit
    - `pricing` (jsonb) - Pricing structure (total_price, discount, currency, etc.)
    - `terms` (text) - Terms and conditions for the kit
    - `is_active` (boolean) - Whether the kit is currently available for purchase
    - `metadata` (jsonb) - Additional metadata (savings percentage, popular badge, etc.)
    - `user_id` (uuid, foreign key) - Reference to the user who created this kit
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on press_support_kits table
  - Authenticated users can read all active kits (for browsing packages)
  - Only the creator can insert/update/delete their kits

  ## Indexes
  - Primary key on id
  - Unique index on kit_slug
  - Index on variant_ids using GIN for array containment queries
  - Index on is_active for filtering available kits
  - Index on user_id for filtering user's kits
*/

-- Create press_support_kits table
CREATE TABLE IF NOT EXISTS press_support_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_slug text UNIQUE NOT NULL,
  kit_name text NOT NULL,
  description text,
  variant_ids uuid[] NOT NULL DEFAULT '{}',
  pricing jsonb DEFAULT '{}'::jsonb,
  terms text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT at_least_one_variant CHECK (array_length(variant_ids, 1) > 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_press_support_kits_variant_ids ON press_support_kits USING GIN(variant_ids);
CREATE INDEX IF NOT EXISTS idx_press_support_kits_is_active ON press_support_kits(is_active);
CREATE INDEX IF NOT EXISTS idx_press_support_kits_user_id ON press_support_kits(user_id);

-- Enable Row Level Security
ALTER TABLE press_support_kits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view active kits" ON press_support_kits;
DROP POLICY IF EXISTS "Authenticated users can create kits" ON press_support_kits;
DROP POLICY IF EXISTS "Users can update own kits" ON press_support_kits;
DROP POLICY IF EXISTS "Users can delete own kits" ON press_support_kits;

-- RLS Policies for press_support_kits

-- SELECT: All authenticated users can view all kits (for browsing packages)
CREATE POLICY "Authenticated users can view active kits"
  ON press_support_kits
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Any authenticated user can create kits
CREATE POLICY "Authenticated users can create kits"
  ON press_support_kits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the creator can update their kits
CREATE POLICY "Users can update own kits"
  ON press_support_kits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the creator can delete their kits
CREATE POLICY "Users can delete own kits"
  ON press_support_kits
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

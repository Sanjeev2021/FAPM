/*
  # Create press_support_contacts and press_support_visuals tables

  ## Overview
  This migration creates two related tables:
  1. Contacts table - Manages contact information for each variant
  2. Visuals table - Manages visual assets (logos, templates, examples) for each variant

  ## New Tables

  ### press_support_contacts
    - `id` (uuid, primary key) - Unique identifier
    - `variant_id` (uuid, foreign key) - Reference to press_support_variants
    - `contact_type` (text) - Type of contact: "commercial", "editorial", "technical"
    - `name` (text, not null) - Contact person's name
    - `email` (text, not null) - Contact email address
    - `phone` (text) - Contact phone number
    - `role` (text) - Job title or role
    - `notes` (text) - Additional notes about this contact
    - `user_id` (uuid, foreign key) - Reference to the user who created this contact
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ### press_support_visuals
    - `id` (uuid, primary key) - Unique identifier
    - `variant_id` (uuid, foreign key) - Reference to press_support_variants
    - `visual_type` (text) - Type of visual: "logo", "template", "example", "banner"
    - `title` (text, not null) - Visual title or description
    - `url` (text, not null) - URL to the visual asset (CDN link)
    - `cdn_provider` (text) - CDN provider name (default: "flaix")
    - `file_format` (text) - File format (png, jpg, pdf, svg, etc.)
    - `dimensions` (text) - Visual dimensions if applicable
    - `metadata` (jsonb) - Additional metadata (file size, alt text, etc.)
    - `user_id` (uuid, foreign key) - Reference to the user who created this visual
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on both tables
  - Authenticated users can read all contacts/visuals (for browsing)
  - Only the creator can insert/update/delete their entries

  ## Indexes
  - Primary keys on both tables
  - Indexes on variant_id for quick lookups
  - Index on contact_type for filtering contacts by type
  - Index on visual_type for filtering visuals by type
  - Unique constraint on (variant_id, email) for contacts to prevent duplicates
  - Indexes on user_id for both tables
*/

-- Create press_support_contacts table
CREATE TABLE IF NOT EXISTS press_support_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES press_support_variants(id) ON DELETE CASCADE,
  contact_type text NOT NULL DEFAULT 'commercial' CHECK (contact_type IN ('commercial', 'editorial', 'technical')),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text,
  notes text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_variant_email UNIQUE (variant_id, email)
);

-- Create indexes for contacts
CREATE INDEX IF NOT EXISTS idx_press_support_contacts_variant ON press_support_contacts(variant_id);
CREATE INDEX IF NOT EXISTS idx_press_support_contacts_type ON press_support_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_press_support_contacts_user_id ON press_support_contacts(user_id);

-- Enable Row Level Security for contacts
ALTER TABLE press_support_contacts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view all contacts" ON press_support_contacts;
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON press_support_contacts;
DROP POLICY IF EXISTS "Users can update own contacts" ON press_support_contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON press_support_contacts;

-- RLS Policies for press_support_contacts

-- SELECT: All authenticated users can view all contacts
CREATE POLICY "Authenticated users can view all contacts"
  ON press_support_contacts
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Any authenticated user can create contacts
CREATE POLICY "Authenticated users can create contacts"
  ON press_support_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the creator can update their contacts
CREATE POLICY "Users can update own contacts"
  ON press_support_contacts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the creator can delete their contacts
CREATE POLICY "Users can delete own contacts"
  ON press_support_contacts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create press_support_visuals table
CREATE TABLE IF NOT EXISTS press_support_visuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES press_support_variants(id) ON DELETE CASCADE,
  visual_type text NOT NULL CHECK (visual_type IN ('logo', 'template', 'example', 'banner', 'mockup')),
  title text NOT NULL,
  url text NOT NULL,
  cdn_provider text DEFAULT 'flaix',
  file_format text,
  dimensions text,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for visuals
CREATE INDEX IF NOT EXISTS idx_press_support_visuals_variant ON press_support_visuals(variant_id);
CREATE INDEX IF NOT EXISTS idx_press_support_visuals_type ON press_support_visuals(visual_type);
CREATE INDEX IF NOT EXISTS idx_press_support_visuals_user_id ON press_support_visuals(user_id);

-- Enable Row Level Security for visuals
ALTER TABLE press_support_visuals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view all visuals" ON press_support_visuals;
DROP POLICY IF EXISTS "Authenticated users can create visuals" ON press_support_visuals;
DROP POLICY IF EXISTS "Users can update own visuals" ON press_support_visuals;
DROP POLICY IF EXISTS "Users can delete own visuals" ON press_support_visuals;

-- RLS Policies for press_support_visuals

-- SELECT: All authenticated users can view all visuals
CREATE POLICY "Authenticated users can view all visuals"
  ON press_support_visuals
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Any authenticated user can create visuals
CREATE POLICY "Authenticated users can create visuals"
  ON press_support_visuals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the creator can update their visuals
CREATE POLICY "Users can update own visuals"
  ON press_support_visuals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the creator can delete their visuals
CREATE POLICY "Users can delete own visuals"
  ON press_support_visuals
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

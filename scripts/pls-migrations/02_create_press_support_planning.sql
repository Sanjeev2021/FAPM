/*
  # Create press_support_planning table - Planning & Availability Management

  ## Overview
  This migration creates the planning table for managing publication dates, availability,
  and booking status for each press support variant.

  ## New Tables
  - `press_support_planning`
    - `id` (uuid, primary key) - Unique identifier
    - `variant_id` (uuid, foreign key) - Reference to press_support_variants
    - `publication_date` (date) - Publication/display date
    - `booking_deadline` (date) - Deadline for booking
    - `material_deadline` (date) - Deadline for submitting materials (ads, creatives)
    - `status` (text) - Availability status: "available", "limited", "sold_out", "closed"
    - `slots_total` (integer) - Total available slots (NULL for unlimited)
    - `slots_booked` (integer) - Number of booked slots
    - `periodicity` (text) - Publication frequency: "daily", "weekly", "monthly", "quarterly", "one_time"
    - `notes` (text) - Additional planning notes
    - `user_id` (uuid, foreign key) - Reference to the user who created this entry
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on press_support_planning table
  - Authenticated users can read all planning entries (for browsing availability)
  - Only the creator can insert/update/delete their planning entries

  ## Indexes
  - Primary key on id
  - Index on variant_id for quick lookups by variant
  - Index on publication_date for date-based queries
  - Index on status for filtering by availability
  - Index on user_id for filtering user's entries
*/

-- Create press_support_planning table
CREATE TABLE IF NOT EXISTS press_support_planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES press_support_variants(id) ON DELETE CASCADE,
  publication_date date NOT NULL,
  booking_deadline date,
  material_deadline date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'limited', 'sold_out', 'closed')),
  slots_total integer CHECK (slots_total IS NULL OR slots_total > 0),
  slots_booked integer DEFAULT 0 CHECK (slots_booked >= 0),
  periodicity text CHECK (periodicity IN ('daily', 'weekly', 'monthly', 'quarterly', 'one_time')),
  notes text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_slot_count CHECK (slots_total IS NULL OR slots_booked <= slots_total)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_press_support_planning_variant ON press_support_planning(variant_id);
CREATE INDEX IF NOT EXISTS idx_press_support_planning_publication_date ON press_support_planning(publication_date);
CREATE INDEX IF NOT EXISTS idx_press_support_planning_status ON press_support_planning(status);
CREATE INDEX IF NOT EXISTS idx_press_support_planning_user_id ON press_support_planning(user_id);

-- Enable Row Level Security
ALTER TABLE press_support_planning ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view all planning" ON press_support_planning;
DROP POLICY IF EXISTS "Authenticated users can create planning" ON press_support_planning;
DROP POLICY IF EXISTS "Users can update own planning" ON press_support_planning;
DROP POLICY IF EXISTS "Users can delete own planning" ON press_support_planning;

-- RLS Policies for press_support_planning

-- SELECT: All authenticated users can view all planning (for checking availability)
CREATE POLICY "Authenticated users can view all planning"
  ON press_support_planning
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Any authenticated user can create planning entries
CREATE POLICY "Authenticated users can create planning"
  ON press_support_planning
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the creator can update their planning entries
CREATE POLICY "Users can update own planning"
  ON press_support_planning
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the creator can delete their planning entries
CREATE POLICY "Users can delete own planning"
  ON press_support_planning
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

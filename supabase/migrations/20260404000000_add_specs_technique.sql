-- Add specs_technique to new_01_supports_variants
-- Source: Airtable NEW_01_Supports_Variants "Specs technique" field (singleSelect)
-- Populated for ~90% of web supports (e.g. "Redirect agence", file format specs)
ALTER TABLE public.new_01_supports_variants
  ADD COLUMN IF NOT EXISTS specs_technique text;

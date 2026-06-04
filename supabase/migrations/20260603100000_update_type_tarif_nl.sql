-- Extend type_tarif to cover NL pricing models:
--   'pack'     = fixed price for a defined bundle of envois (e.g. 5 000 € / 10 000 envois)
--   'unitaire' = price per envoi, quantity scales freely
--
-- Existing values ('forfait', 'cpm') remain valid for Print/Web.
-- Default 'forfait' is unchanged for backward compatibility.

ALTER TABLE public.new_01_supports_variants
  DROP CONSTRAINT IF EXISTS new_01_supports_variants_type_tarif_check;

ALTER TABLE public.new_01_supports_variants
  ADD CONSTRAINT new_01_supports_variants_type_tarif_check
  CHECK (type_tarif IN ('forfait', 'cpm', 'pack', 'unitaire'));

-- Add storage_path to export_jobs so we can regenerate signed URLs on demand
-- The file_url column stores a pre-signed URL that expires after 1 hour
-- With storage_path we can create fresh signed URLs whenever needed

ALTER TABLE public.export_jobs ADD COLUMN storage_path TEXT;

COMMENT ON COLUMN public.export_jobs.storage_path IS 'Supabase Storage path (bucket-relative) for on-demand signed URL generation';

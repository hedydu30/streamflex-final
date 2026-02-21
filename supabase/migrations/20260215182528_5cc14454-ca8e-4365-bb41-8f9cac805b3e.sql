-- Add folder_id column to import_jobs for server-side file fetching
ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS fichier_folder_id integer;
ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS fichier_token text;
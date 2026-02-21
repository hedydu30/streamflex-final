-- Add model_id column (may already exist from partial migration, use IF NOT EXISTS pattern)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='imported_videos' AND column_name='model_id') THEN
    ALTER TABLE public.imported_videos ADD COLUMN model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for fast lookups by model
CREATE INDEX IF NOT EXISTS idx_imported_videos_model_id ON public.imported_videos(model_id);

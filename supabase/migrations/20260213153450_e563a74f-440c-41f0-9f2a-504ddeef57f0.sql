
-- Table for imported videos from external sources
CREATE TABLE public.imported_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('1fichier', 'coomer')),
  external_id TEXT,
  title TEXT NOT NULL,
  original_url TEXT NOT NULL,
  download_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  file_size BIGINT,
  format TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.imported_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own imports"
  ON public.imported_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own imports"
  ON public.imported_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own imports"
  ON public.imported_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own imports"
  ON public.imported_videos FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_imported_videos_user_id ON public.imported_videos(user_id);
CREATE INDEX idx_imported_videos_source ON public.imported_videos(source);
CREATE INDEX idx_imported_videos_imported_at ON public.imported_videos(imported_at);

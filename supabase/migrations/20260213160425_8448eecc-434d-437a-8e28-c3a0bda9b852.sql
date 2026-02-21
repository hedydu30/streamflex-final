
-- Table to store model profiles with profile images
CREATE TABLE public.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  profile_image_url text,
  source_platform text, -- e.g. 'onlyfans', 'fansly', 'custom'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own models"
  ON public.models FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own models"
  ON public.models FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own models"
  ON public.models FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own models"
  ON public.models FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_models_updated_at
  BEFORE UPDATE ON public.models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for model profile images
INSERT INTO storage.buckets (id, name, public) VALUES ('model-avatars', 'model-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for model avatars
CREATE POLICY "Model avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'model-avatars');

CREATE POLICY "Users can upload model avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'model-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update model avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'model-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete model avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'model-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

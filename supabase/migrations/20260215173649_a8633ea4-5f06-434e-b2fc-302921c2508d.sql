
-- Table to store 1fichier API tokens securely per user
CREATE TABLE public.fichier_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT 'Compte 1',
  token TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT NULL,
  account_info JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one token value per user
ALTER TABLE public.fichier_tokens ADD CONSTRAINT fichier_tokens_user_token_unique UNIQUE (user_id, token);

-- Enable RLS
ALTER TABLE public.fichier_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tokens
CREATE POLICY "Users can view their own tokens"
ON public.fichier_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens"
ON public.fichier_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens"
ON public.fichier_tokens FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tokens"
ON public.fichier_tokens FOR DELETE
USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_fichier_tokens_updated_at
BEFORE UPDATE ON public.fichier_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- Create model_favorites table
CREATE TABLE public.model_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  model_id UUID NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, model_id)
);

-- Enable RLS
ALTER TABLE public.model_favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own model favorites
CREATE POLICY "Users can view their own model favorites"
ON public.model_favorites FOR SELECT USING (auth.uid() = user_id);

-- Users can add model favorites
CREATE POLICY "Users can add model favorites"
ON public.model_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove model favorites
CREATE POLICY "Users can delete their own model favorites"
ON public.model_favorites FOR DELETE USING (auth.uid() = user_id);

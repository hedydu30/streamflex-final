
-- Create themes table
CREATE TABLE public.themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  colors JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active themes"
  ON public.themes FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can insert themes"
  ON public.themes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update themes"
  ON public.themes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete themes"
  ON public.themes FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.profiles
  ADD COLUMN selected_theme_id UUID REFERENCES public.themes(id) ON DELETE SET NULL;

CREATE TRIGGER update_themes_updated_at
  BEFORE UPDATE ON public.themes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.themes (name, description, colors, is_default, created_by) VALUES
('Classique', 'Thème sombre par défaut avec accents rouges', '{"background":"0 0% 8%","foreground":"0 0% 95%","primary":"0 85% 50%","primary-foreground":"0 0% 100%","secondary":"0 0% 16%","secondary-foreground":"0 0% 90%","card":"0 0% 11%","card-foreground":"0 0% 95%","accent":"0 0% 20%","accent-foreground":"0 0% 95%","muted":"0 0% 16%","muted-foreground":"0 0% 60%","border":"0 0% 18%"}', true, 'system'),
('Océan', 'Bleu profond inspiré de l''océan', '{"background":"210 30% 8%","foreground":"210 10% 95%","primary":"200 80% 50%","primary-foreground":"0 0% 100%","secondary":"210 25% 16%","secondary-foreground":"210 10% 90%","card":"210 25% 11%","card-foreground":"210 10% 95%","accent":"200 20% 20%","accent-foreground":"210 10% 95%","muted":"210 25% 16%","muted-foreground":"210 10% 60%","border":"210 20% 18%"}', false, 'system'),
('Émeraude', 'Vert émeraude élégant', '{"background":"150 30% 6%","foreground":"150 10% 95%","primary":"155 75% 45%","primary-foreground":"0 0% 100%","secondary":"150 20% 14%","secondary-foreground":"150 10% 90%","card":"150 22% 10%","card-foreground":"150 10% 95%","accent":"155 18% 18%","accent-foreground":"150 10% 95%","muted":"150 20% 14%","muted-foreground":"150 10% 55%","border":"150 18% 16%"}', false, 'system'),
('Violet Nuit', 'Violet mystérieux nocturne', '{"background":"270 25% 8%","foreground":"270 10% 95%","primary":"270 70% 55%","primary-foreground":"0 0% 100%","secondary":"270 20% 16%","secondary-foreground":"270 10% 90%","card":"270 22% 11%","card-foreground":"270 10% 95%","accent":"270 18% 20%","accent-foreground":"270 10% 95%","muted":"270 20% 16%","muted-foreground":"270 10% 60%","border":"270 18% 18%"}', false, 'system'),
('Doré', 'Or et noir luxueux', '{"background":"40 15% 7%","foreground":"40 10% 95%","primary":"42 85% 55%","primary-foreground":"0 0% 5%","secondary":"40 15% 15%","secondary-foreground":"40 10% 90%","card":"40 15% 10%","card-foreground":"40 10% 95%","accent":"42 15% 20%","accent-foreground":"40 10% 95%","muted":"40 15% 15%","muted-foreground":"40 10% 55%","border":"40 12% 18%"}', false, 'system');

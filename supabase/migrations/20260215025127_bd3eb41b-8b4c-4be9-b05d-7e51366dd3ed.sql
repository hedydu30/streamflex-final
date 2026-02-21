
-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view visible categories" ON public.categories FOR SELECT USING (is_visible = true);

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TAGS
-- =============================================
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tags" ON public.tags FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view tags" ON public.tags FOR SELECT USING (true);

-- =============================================
-- VIDEO_TAGS (junction)
-- =============================================
CREATE TABLE public.video_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.imported_videos(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(video_id, tag_id)
);

ALTER TABLE public.video_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage video_tags" ON public.video_tags FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view video_tags" ON public.video_tags FOR SELECT USING (true);

-- =============================================
-- COMMENTS
-- =============================================
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.imported_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all comments" ON public.comments FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view approved comments" ON public.comments FOR SELECT USING (status = 'approved' OR auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- VIDEO_RATINGS
-- =============================================
CREATE TABLE public.video_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.imported_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id)
);

ALTER TABLE public.video_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all ratings" ON public.video_ratings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own rating" ON public.video_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rating" ON public.video_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Everyone can view ratings" ON public.video_ratings FOR SELECT USING (true);

-- =============================================
-- BLOCKED_IPS
-- =============================================
CREATE TABLE public.blocked_ips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  reason TEXT,
  blocked_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage blocked IPs" ON public.blocked_ips FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- EXTEND imported_videos
-- =============================================
ALTER TABLE public.imported_videos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS full_description TEXT,
  ADD COLUMN IF NOT EXISTS video_type TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_ratings BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS url_1080p TEXT,
  ADD COLUMN IF NOT EXISTS url_720p TEXT,
  ADD COLUMN IF NOT EXISTS url_480p TEXT,
  ADD COLUMN IF NOT EXISTS mirror_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_hover_url TEXT,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(2,1) DEFAULT 0;

-- =============================================
-- SITE_SETTINGS (for general admin settings)
-- =============================================
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage site settings" ON public.site_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT USING (true);

-- Seed default settings
INSERT INTO public.site_settings (key, value) VALUES 
  ('general', '{"site_name": "StreamFlix", "contact_email": "", "timezone": "Europe/Paris"}'::jsonb),
  ('video', '{"default_quality": "auto", "autoplay": true, "allow_quality_change": true, "default_volume": 80}'::jsonb),
  ('subscription', '{"gateway": "stripe", "stripe_key": "", "test_mode": true}'::jsonb),
  ('security', '{"force_email_verification": true, "multiple_sessions": true, "max_login_attempts": 5}'::jsonb),
  ('plans', '{"free": {"name": "Free", "max_resolution": "HD", "allow_downloads": false, "show_ads": true}, "premium": {"name": "Premium", "monthly_price": 9.99, "yearly_price": 99.99, "max_resolution": "4K", "allow_downloads": true, "show_ads": false, "trial_days": 7}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Function to update average rating
CREATE OR REPLACE FUNCTION public.update_video_average_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_video_id UUID;
BEGIN
  v_video_id := COALESCE(NEW.video_id, OLD.video_id);
  UPDATE public.imported_videos
  SET average_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.video_ratings WHERE video_id = v_video_id), 0)
  WHERE id = v_video_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_avg_rating
AFTER INSERT OR UPDATE OR DELETE ON public.video_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_video_average_rating();

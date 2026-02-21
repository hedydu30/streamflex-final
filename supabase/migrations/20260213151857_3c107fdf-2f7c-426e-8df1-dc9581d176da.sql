
-- ============================================================
-- ChronoStream Database Schema
-- ============================================================

-- 1. CONTENTS - Catalogue de contenus
CREATE TABLE public.contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'movie', -- movie, series, episode, documentary
  genre TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  release_year INTEGER,
  rating TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contents_type ON public.contents(type);
CREATE INDEX idx_contents_genre ON public.contents USING GIN(genre);
CREATE INDEX idx_contents_release_year ON public.contents(release_year);

ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contents are viewable by everyone"
  ON public.contents FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage contents"
  ON public.contents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE TRIGGER update_contents_updated_at
  BEFORE UPDATE ON public.contents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. SESSIONS - Sessions utilisateur actives
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_hashed TEXT,
  user_agent TEXT,
  device_info TEXT,
  source TEXT NOT NULL DEFAULT 'web', -- web, mobile, tv
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  retention_ttl INTERVAL DEFAULT '90 days'
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_is_active ON public.sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_sessions_started_at ON public.sessions(started_at);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sessions"
  ON public.sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. LOGIN_LOGS - Historique de connexions
CREATE TABLE public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  ip_hashed TEXT,
  user_agent TEXT,
  source TEXT DEFAULT 'web',
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_ttl INTERVAL DEFAULT '180 days'
);

CREATE INDEX idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX idx_login_logs_email ON public.login_logs(email);
CREATE INDEX idx_login_logs_created_at ON public.login_logs(created_at);
CREATE INDEX idx_login_logs_success ON public.login_logs(success);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own login logs"
  ON public.login_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all login logs"
  ON public.login_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert login logs"
  ON public.login_logs FOR INSERT
  WITH CHECK (true);

-- 4. CONTENT_VIEWS - Historique de visionnage
CREATE TABLE public.content_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_id UUID NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  watched_percent NUMERIC(5,2) DEFAULT 0,
  device_info TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  retention_ttl INTERVAL DEFAULT '730 days'
);

CREATE INDEX idx_content_views_user_id ON public.content_views(user_id);
CREATE INDEX idx_content_views_content_id ON public.content_views(content_id);
CREATE INDEX idx_content_views_watched_at ON public.content_views(watched_at);
CREATE INDEX idx_content_views_user_content ON public.content_views(user_id, content_id);
CREATE INDEX idx_content_views_completed ON public.content_views(user_id, completed);

ALTER TABLE public.content_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own content views"
  ON public.content_views FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own content views"
  ON public.content_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own content views"
  ON public.content_views FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all content views"
  ON public.content_views FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. VUE MATÉRIALISÉE - Top contenus populaires
CREATE MATERIALIZED VIEW public.mv_popular_contents AS
SELECT
  cv.content_id,
  c.title,
  c.type,
  COUNT(DISTINCT cv.user_id) AS unique_viewers,
  COUNT(*) AS total_views,
  AVG(cv.watched_percent) AS avg_watched_percent,
  MAX(cv.watched_at) AS last_watched_at
FROM public.content_views cv
JOIN public.contents c ON c.id = cv.content_id
WHERE cv.watched_at > now() - INTERVAL '30 days'
GROUP BY cv.content_id, c.title, c.type
ORDER BY unique_viewers DESC;

CREATE UNIQUE INDEX idx_mv_popular_contents ON public.mv_popular_contents(content_id);

-- 6. FONCTION DE PURGE / RÉTENTION
CREATE OR REPLACE FUNCTION public.purge_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_login_logs INTEGER;
  deleted_sessions INTEGER;
  anonymized_login_logs INTEGER;
BEGIN
  -- Purge login_logs au-delà de retention_ttl (défaut 180j)
  DELETE FROM public.login_logs
  WHERE created_at < now() - COALESCE(retention_ttl, '180 days')
  RETURNING 1;
  GET DIAGNOSTICS deleted_login_logs = ROW_COUNT;

  -- Purge sessions inactives au-delà de retention_ttl (défaut 90j)
  DELETE FROM public.sessions
  WHERE is_active = false
    AND ended_at < now() - COALESCE(retention_ttl, '90 days')
  RETURNING 1;
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  -- Anonymisation des login_logs entre 180j et 365j
  UPDATE public.login_logs
  SET email = 'anonymized', ip_hashed = NULL, user_agent = NULL
  WHERE created_at < now() - INTERVAL '365 days'
    AND email != 'anonymized';
  GET DIAGNOSTICS anonymized_login_logs = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_login_logs', deleted_login_logs,
    'deleted_sessions', deleted_sessions,
    'anonymized_login_logs', anonymized_login_logs,
    'purged_at', now()
  );
END;
$$;

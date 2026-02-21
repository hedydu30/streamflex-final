
-- Fix 1: Restrict login_logs INSERT to authenticated users or service role
DROP POLICY "System can insert login logs" ON public.login_logs;

CREATE POLICY "Authenticated users can log their own logins"
  ON public.login_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Fix 2: Revoke API access to materialized view
REVOKE ALL ON public.mv_popular_contents FROM anon, authenticated;

-- Grant only to admins via a wrapper function
CREATE OR REPLACE FUNCTION public.get_popular_contents()
RETURNS TABLE(
  content_id UUID,
  title TEXT,
  type TEXT,
  unique_viewers BIGINT,
  total_views BIGINT,
  avg_watched_percent NUMERIC,
  last_watched_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.mv_popular_contents;
$$;

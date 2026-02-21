
-- Fix 1: Add 'direct' to imported_videos source constraint
ALTER TABLE public.imported_videos DROP CONSTRAINT IF EXISTS imported_videos_source_check;
ALTER TABLE public.imported_videos ADD CONSTRAINT imported_videos_source_check CHECK (source IN ('1fichier', 'coomer', 'direct'));

-- Fix 2: Fix login_logs INSERT policy to restrict to own user_id
DROP POLICY IF EXISTS "System can insert login logs" ON public.login_logs;
CREATE POLICY "Users can log their own logins"
  ON public.login_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Fix 3: Add admin check to purge_expired_data function
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
  -- Authorization check: admin only
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  DELETE FROM public.login_logs
  WHERE created_at < now() - COALESCE(retention_ttl, '180 days')
  RETURNING 1;
  GET DIAGNOSTICS deleted_login_logs = ROW_COUNT;

  DELETE FROM public.sessions
  WHERE is_active = false
    AND ended_at < now() - COALESCE(retention_ttl, '90 days')
  RETURNING 1;
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

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

-- Fix 4: Make model-avatars bucket private
UPDATE storage.buckets SET public = false WHERE id = 'model-avatars';

-- Update SELECT policy to authenticated users only
DROP POLICY IF EXISTS "Model avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can view model avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'model-avatars' AND auth.role() = 'authenticated');

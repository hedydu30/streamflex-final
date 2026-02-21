
-- User sanctions table (warn, temp ban, permanent ban, IP block, device block)
CREATE TYPE public.sanction_type AS ENUM ('warning', 'temp_ban', 'permanent_ban', 'ip_block', 'device_block');

CREATE TABLE public.user_sanctions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sanction_type sanction_type NOT NULL,
  reason TEXT NOT NULL,
  issued_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.user_sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sanctions"
  ON public.user_sanctions FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own sanctions"
  ON public.user_sanctions FOR SELECT
  USING (auth.uid() = user_id);

-- Activity logs for video events (play, pause, end, like, unlike, mix)
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'video',
  resource_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity logs"
  ON public.activity_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own activity logs"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_event_type ON public.activity_logs(event_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_user_sanctions_user_active ON public.user_sanctions(user_id) WHERE is_active = true;

-- Function to check if user is banned
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sanctions
    WHERE user_id = _user_id
      AND is_active = true
      AND sanction_type IN ('temp_ban', 'permanent_ban')
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Max sessions setting (stored in profiles would be too heavy, use a constant for now)
-- Session enforcement will be done client-side checking active sessions count

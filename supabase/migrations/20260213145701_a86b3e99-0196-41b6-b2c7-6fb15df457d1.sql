
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: users can see their own roles, admins can see all
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Premium keys table
CREATE TABLE public.premium_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code TEXT NOT NULL UNIQUE,
  duration_days INTEGER, -- NULL = lifetime
  duration_label TEXT NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE -- calculated on activation
);
ALTER TABLE public.premium_keys ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with keys
CREATE POLICY "Admins can manage keys"
ON public.premium_keys FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view keys they used
CREATE POLICY "Users can view their own used keys"
ON public.premium_keys FOR SELECT
USING (used_by = auth.uid());

-- Anyone authenticated can attempt to activate (update) a key
CREATE POLICY "Users can activate keys"
ON public.premium_keys FOR UPDATE
USING (is_used = false)
WITH CHECK (used_by = auth.uid() AND is_used = true);

-- 4. Add premium fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN premium_until TIMESTAMP WITH TIME ZONE;

-- 5. Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- info, success, warning, premium
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- 6. Function to activate a premium key
CREATE OR REPLACE FUNCTION public.activate_premium_key(p_key_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key RECORD;
  v_user_id UUID;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  SELECT * INTO v_key FROM public.premium_keys WHERE key_code = p_key_code AND is_used = false;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clé invalide ou déjà utilisée');
  END IF;

  -- Calculate expiration
  IF v_key.duration_days IS NOT NULL THEN
    v_expires_at := now() + (v_key.duration_days || ' days')::INTERVAL;
  ELSE
    v_expires_at := NULL; -- lifetime
  END IF;

  -- Mark key as used
  UPDATE public.premium_keys 
  SET is_used = true, used_by = v_user_id, used_at = now(), expires_at = v_expires_at
  WHERE id = v_key.id;

  -- Update profile
  UPDATE public.profiles 
  SET is_premium = true, premium_until = v_expires_at
  WHERE user_id = v_user_id;

  -- Create notification
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_user_id, 
    '🎉 Premium activé !', 
    CASE WHEN v_key.duration_days IS NOT NULL 
      THEN 'Votre accès premium ' || v_key.duration_label || ' est maintenant actif !'
      ELSE 'Votre accès premium à vie est maintenant actif !'
    END,
    'premium'
  );

  RETURN jsonb_build_object(
    'success', true, 
    'duration_label', v_key.duration_label,
    'expires_at', v_expires_at
  );
END;
$$;

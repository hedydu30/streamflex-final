
-- Update the trigger function to allow admins to use reserved terms
CREATE OR REPLACE FUNCTION public.validate_no_reserved_names()
RETURNS TRIGGER AS $$
DECLARE
  reserved_terms text[] := ARRAY[
    'admin', 'administrateur', 'administrator',
    'moderateur', 'moderator', 'modo',
    'support', 'staff', 'system', 'système',
    'streamflix', 'official', 'officiel',
    'root', 'superuser', 'superadmin',
    'helpdesk', 'service', 'bot'
  ];
  term text;
  check_value text;
  is_admin boolean;
BEGIN
  -- Check if the current user is an admin – if so, skip validation
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = COALESCE(auth.uid(), NEW.user_id)
      AND role = 'admin'
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Check display_name
  IF NEW.display_name IS NOT NULL THEN
    check_value := lower(trim(NEW.display_name));
    check_value := regexp_replace(check_value, '[^a-zàâäéèêëïîôùûüÿçœæ0-9]', '', 'g');
    FOREACH term IN ARRAY reserved_terms LOOP
      IF check_value LIKE '%' || term || '%' THEN
        RAISE EXCEPTION 'Le nom "%" contient un terme réservé : "%". Veuillez choisir un autre nom.', NEW.display_name, term;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add more visual themes
INSERT INTO public.themes (name, description, colors, created_by, is_active, is_default) VALUES
('Sunset', 'Coucher de soleil chaleureux', '{"background":"15 25% 7%","foreground":"15 10% 95%","card":"15 22% 10%","card-foreground":"15 10% 95%","primary":"20 90% 55%","primary-foreground":"0 0% 100%","secondary":"15 20% 15%","secondary-foreground":"15 10% 90%","muted":"15 20% 14%","muted-foreground":"15 10% 55%","accent":"20 18% 20%","accent-foreground":"15 10% 95%","border":"15 15% 18%"}', 'system', true, false),
('Rose', 'Rose tendre et délicat', '{"background":"330 20% 7%","foreground":"330 10% 95%","card":"330 18% 10%","card-foreground":"330 10% 95%","primary":"340 75% 55%","primary-foreground":"0 0% 100%","secondary":"330 18% 15%","secondary-foreground":"330 10% 90%","muted":"330 18% 14%","muted-foreground":"330 10% 55%","accent":"340 15% 20%","accent-foreground":"330 10% 95%","border":"330 14% 18%"}', 'system', true, false),
('Cyan', 'Bleu cyan électrique', '{"background":"185 30% 6%","foreground":"185 10% 95%","card":"185 25% 9%","card-foreground":"185 10% 95%","primary":"185 85% 45%","primary-foreground":"0 0% 5%","secondary":"185 22% 14%","secondary-foreground":"185 10% 90%","muted":"185 20% 13%","muted-foreground":"185 10% 55%","accent":"185 18% 18%","accent-foreground":"185 10% 95%","border":"185 18% 16%"}', 'system', true, false),
('Ambre', 'Ton ambre et cuivre profond', '{"background":"30 20% 7%","foreground":"30 10% 95%","card":"30 18% 10%","card-foreground":"30 10% 95%","primary":"35 90% 50%","primary-foreground":"0 0% 5%","secondary":"30 18% 15%","secondary-foreground":"30 10% 90%","muted":"30 18% 14%","muted-foreground":"30 10% 55%","accent":"35 15% 20%","accent-foreground":"30 10% 95%","border":"30 14% 18%"}', 'system', true, false),
('Minuit', 'Bleu nuit profond et sobre', '{"background":"230 30% 6%","foreground":"220 10% 95%","card":"230 25% 9%","card-foreground":"220 10% 95%","primary":"220 70% 55%","primary-foreground":"0 0% 100%","secondary":"230 22% 14%","secondary-foreground":"220 10% 90%","muted":"230 20% 13%","muted-foreground":"220 10% 55%","accent":"220 18% 18%","accent-foreground":"220 10% 95%","border":"230 18% 16%"}', 'system', true, false);

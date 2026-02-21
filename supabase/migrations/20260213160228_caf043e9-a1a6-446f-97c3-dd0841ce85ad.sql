
-- Function to validate that display names and emails don't contain reserved/sensitive terms
CREATE OR REPLACE FUNCTION public.validate_no_reserved_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- Check display_name
  IF NEW.display_name IS NOT NULL THEN
    check_value := lower(trim(NEW.display_name));
    -- Remove special chars/spaces for bypass prevention (e.g. "a d m i n")
    check_value := regexp_replace(check_value, '[^a-zàâäéèêëïîôùûüÿçœæ0-9]', '', 'g');
    FOREACH term IN ARRAY reserved_terms LOOP
      IF check_value LIKE '%' || term || '%' THEN
        RAISE EXCEPTION 'Le nom "%" contient un terme réservé : "%". Veuillez choisir un autre nom.', NEW.display_name, term;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on profiles table
DROP TRIGGER IF EXISTS trg_validate_profile_name ON public.profiles;
CREATE TRIGGER trg_validate_profile_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_no_reserved_names();

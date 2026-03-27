-- Fix: promoting the first super_admin from SQL Editor failed because
-- auth.uid() is NULL in the dashboard SQL runner, so is_staff() was false.
-- Allow role changes when there is no JWT (trusted DB context); keep the
-- restriction for all normal API requests (auth.uid() present).

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid () IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_staff () THEN
    RAISE EXCEPTION 'Only staff (super_admin or regional_director) can change app roles';
  END IF;
  RETURN NEW;
END;
$$;

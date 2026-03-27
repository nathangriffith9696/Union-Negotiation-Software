-- App roles, user profiles, field-rep ↔ local assignments, and RLS for authenticated users.
-- After applying: promote at least one user to super_admin and add local_assignments for field reps
-- (see repo README or comments at end of this file).

-- ---------------------------------------------------------------------------
-- Role enum & profiles
-- ---------------------------------------------------------------------------

CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'regional_director',
  'field_rep'
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'field_rep',
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles (role);

COMMENT ON TABLE public.profiles IS 'One row per auth user; role drives RLS.';
COMMENT ON COLUMN public.profiles.role IS 'super_admin: full access; regional_director: staff access + manage assignments; field_rep: assigned locals only.';

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user_profile ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    'field_rep',
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile ();

-- Existing users (before trigger): backfill as field_rep
INSERT INTO public.profiles (id, role, display_name)
SELECT
  u.id,
  'field_rep',
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.email)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- ---------------------------------------------------------------------------
-- Local assignments (director assigns reps to locals)
-- ---------------------------------------------------------------------------

CREATE TABLE public.local_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  local_id UUID NOT NULL REFERENCES public.locals (id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT local_assignments_user_local UNIQUE (user_id, local_id)
);

CREATE INDEX idx_local_assignments_user_id ON public.local_assignments (user_id);
CREATE INDEX idx_local_assignments_local_id ON public.local_assignments (local_id);

COMMENT ON TABLE public.local_assignments IS 'Field reps (and optionally others) may work only on assigned locals.';

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER to avoid recursion in policies)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_staff ()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'regional_director')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_local (p_local_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff()
    OR EXISTS (
      SELECT 1
      FROM public.local_assignments la
      WHERE la.user_id = auth.uid()
        AND la.local_id = p_local_id
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_negotiation (p_negotiation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff()
    OR EXISTS (
      SELECT 1
      FROM public.negotiations neg
      INNER JOIN public.bargaining_units bu ON bu.id = neg.bargaining_unit_id
      INNER JOIN public.local_assignments la
        ON la.local_id = bu.local_id
        AND la.user_id = auth.uid()
      WHERE neg.id = p_negotiation_id
    );
$$;

-- ---------------------------------------------------------------------------
-- profiles: RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own_or_staff"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_staff ());

CREATE POLICY "profiles_update_own_or_staff"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_staff ())
  WITH CHECK (id = auth.uid() OR public.is_staff ());

-- Non-staff users cannot change their own role (only display_name, etc.).
CREATE OR REPLACE FUNCTION public.enforce_profile_role_change ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dashboard SQL Editor / no JWT: allow (bootstrap). API calls always have auth.uid().
  IF auth.uid () IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_staff () THEN
    RAISE EXCEPTION 'Only staff (super_admin or regional_director) can change app roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_staff_only ON public.profiles;

CREATE TRIGGER trg_profiles_role_staff_only
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_profile_role_change ();

-- ---------------------------------------------------------------------------
-- local_assignments: RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.local_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "local_assignments_select_own_or_staff"
  ON public.local_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_staff ());

CREATE POLICY "local_assignments_insert_staff"
  ON public.local_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff ());

CREATE POLICY "local_assignments_update_staff"
  ON public.local_assignments
  FOR UPDATE
  TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

CREATE POLICY "local_assignments_delete_staff"
  ON public.local_assignments
  FOR DELETE
  TO authenticated
  USING (public.is_staff ());

-- ---------------------------------------------------------------------------
-- Reference data: districts, locals, bargaining_units
-- ---------------------------------------------------------------------------

ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "districts_select_assigned_or_staff"
  ON public.districts
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff ()
    OR EXISTS (
      SELECT 1
      FROM public.locals l
      INNER JOIN public.local_assignments la
        ON la.local_id = l.id
        AND la.user_id = auth.uid ()
      WHERE l.district_id = districts.id
    )
  );

CREATE POLICY "districts_write_staff"
  ON public.districts
  FOR ALL
  TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

ALTER TABLE public.locals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locals_select_assigned_or_staff"
  ON public.locals
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_local (id));

CREATE POLICY "locals_write_staff"
  ON public.locals
  FOR ALL
  TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

ALTER TABLE public.bargaining_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bargaining_units_select_assigned_or_staff"
  ON public.bargaining_units
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_local (local_id));

CREATE POLICY "bargaining_units_write_staff"
  ON public.bargaining_units
  FOR ALL
  TO authenticated
  USING (public.is_staff ())
  WITH CHECK (public.is_staff ());

-- ---------------------------------------------------------------------------
-- negotiations
-- ---------------------------------------------------------------------------

ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negotiations_select_accessible"
  ON public.negotiations
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (id));

CREATE POLICY "negotiations_insert_accessible"
  ON public.negotiations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff ()
    OR EXISTS (
      SELECT 1
      FROM public.bargaining_units bu
      INNER JOIN public.local_assignments la
        ON la.local_id = bu.local_id
        AND la.user_id = auth.uid ()
      WHERE bu.id = bargaining_unit_id
    )
  );

CREATE POLICY "negotiations_update_accessible"
  ON public.negotiations
  FOR UPDATE
  TO authenticated
  USING (public.user_can_access_negotiation (id))
  WITH CHECK (public.user_can_access_negotiation (id));

CREATE POLICY "negotiations_delete_staff"
  ON public.negotiations
  FOR DELETE
  TO authenticated
  USING (public.is_staff ());

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select_accessible"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "sessions_write_accessible"
  ON public.sessions
  FOR ALL
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id))
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

-- ---------------------------------------------------------------------------
-- proposals
-- ---------------------------------------------------------------------------

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_delete_draft_only" ON public.proposals;

CREATE POLICY "proposals_select_accessible"
  ON public.proposals
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "proposals_insert_accessible"
  ON public.proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "proposals_update_accessible"
  ON public.proposals
  FOR UPDATE
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id))
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "proposals_delete_accessible"
  ON public.proposals
  FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_negotiation (negotiation_id)
    AND (public.is_staff () OR status = 'draft')
  );

-- ---------------------------------------------------------------------------
-- session_proposals
-- ---------------------------------------------------------------------------

ALTER TABLE public.session_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_proposals_select_accessible"
  ON public.session_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_proposals.session_id
        AND public.user_can_access_negotiation (s.negotiation_id)
    )
  );

CREATE POLICY "session_proposals_write_accessible"
  ON public.session_proposals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_proposals.session_id
        AND public.user_can_access_negotiation (s.negotiation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_proposals.session_id
        AND public.user_can_access_negotiation (s.negotiation_id)
    )
  );

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_accessible"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "notes_write_accessible"
  ON public.notes
  FOR ALL
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id))
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_accessible"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "documents_write_accessible"
  ON public.documents
  FOR ALL
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id))
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

-- ---------------------------------------------------------------------------
-- negotiation_contract_versions & negotiation_contract_drafts
-- ---------------------------------------------------------------------------

ALTER TABLE public.negotiation_contract_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negotiation_contract_versions_select_accessible"
  ON public.negotiation_contract_versions
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "negotiation_contract_versions_write_accessible"
  ON public.negotiation_contract_versions
  FOR ALL
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id))
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

ALTER TABLE public.negotiation_contract_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negotiation_contract_drafts_select_accessible"
  ON public.negotiation_contract_drafts
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id));

CREATE POLICY "negotiation_contract_drafts_write_accessible"
  ON public.negotiation_contract_drafts
  FOR ALL
  TO authenticated
  USING (public.user_can_access_negotiation (negotiation_id))
  WITH CHECK (public.user_can_access_negotiation (negotiation_id));

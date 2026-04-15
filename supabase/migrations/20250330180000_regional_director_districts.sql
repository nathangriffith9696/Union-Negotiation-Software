-- Regional directors are scoped to one or more districts. Super admins assign districts
-- in `regional_director_districts`; RLS narrows negotiations, locals, assignments, and masters.

-- ---------------------------------------------------------------------------
-- Table: which districts each regional director covers
-- ---------------------------------------------------------------------------

CREATE TABLE public.regional_director_districts (
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  district_id UUID NOT NULL REFERENCES public.districts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT regional_director_districts_pk PRIMARY KEY (user_id, district_id)
);

CREATE INDEX idx_regional_director_districts_district_id
  ON public.regional_director_districts (district_id);

COMMENT ON TABLE public.regional_director_districts IS
  'Super admin assigns districts to regional directors; drives scoped access.';

CREATE OR REPLACE FUNCTION public.enforce_rdd_user_is_regional_director ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = NEW.user_id
      AND p.role = 'regional_director'
  ) THEN
    RAISE EXCEPTION 'regional_director_districts.user_id must be a regional_director';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rdd_user_must_be_rd ON public.regional_director_districts;

CREATE TRIGGER trg_rdd_user_must_be_rd
  BEFORE INSERT OR UPDATE ON public.regional_director_districts
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_rdd_user_is_regional_director ();

CREATE OR REPLACE FUNCTION public.clear_regional_director_districts_on_role_change ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'regional_director' AND NEW.role IS DISTINCT FROM 'regional_director' THEN
    DELETE FROM public.regional_director_districts
    WHERE user_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_clear_rdd_on_demotion ON public.profiles;

CREATE TRIGGER trg_profiles_clear_rdd_on_demotion
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.clear_regional_director_districts_on_role_change ();

ALTER TABLE public.regional_director_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regional_director_districts_select_scope"
  ON public.regional_director_districts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin ()
    OR user_id = auth.uid ()
  );

CREATE POLICY "regional_director_districts_write_super_admin"
  ON public.regional_director_districts
  FOR ALL
  TO authenticated
  USING (public.is_super_admin ())
  WITH CHECK (public.is_super_admin ());

-- ---------------------------------------------------------------------------
-- Access helpers (replace)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_can_access_local (p_local_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = p_local_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.local_assignments la
      WHERE la.user_id = auth.uid ()
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
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.negotiations neg
        INNER JOIN public.bargaining_units bu ON bu.id = neg.bargaining_unit_id
        INNER JOIN public.locals l ON l.id = bu.local_id
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE neg.id = p_negotiation_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.negotiations neg
      INNER JOIN public.bargaining_units bu ON bu.id = neg.bargaining_unit_id
      INNER JOIN public.local_assignments la
        ON la.local_id = bu.local_id
        AND la.user_id = auth.uid ()
      WHERE neg.id = p_negotiation_id
    );
$$;

-- Only super admins may change profiles.role (SQL Editor bootstrap: auth.uid() IS NULL still allowed in trigger body)
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

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_super_admin () THEN
    RAISE EXCEPTION 'Only super administrators can change app roles';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- local_assignments
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "local_assignments_select_own_or_staff" ON public.local_assignments;
DROP POLICY IF EXISTS "local_assignments_insert_staff" ON public.local_assignments;
DROP POLICY IF EXISTS "local_assignments_update_staff" ON public.local_assignments;
DROP POLICY IF EXISTS "local_assignments_delete_staff" ON public.local_assignments;

CREATE POLICY "local_assignments_select_scoped"
  ON public.local_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid ()
    OR public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = local_assignments.local_id
      )
    )
  );

CREATE POLICY "local_assignments_insert_scoped"
  ON public.local_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = local_assignments.local_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = local_assignments.user_id
          AND p.role = 'field_rep'
      )
    )
  );

CREATE POLICY "local_assignments_update_scoped"
  ON public.local_assignments
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = local_assignments.local_id
      )
    )
  )
  WITH CHECK (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = local_assignments.local_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = local_assignments.user_id
          AND p.role = 'field_rep'
      )
    )
  );

CREATE POLICY "local_assignments_delete_scoped"
  ON public.local_assignments
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = local_assignments.local_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Districts: RD sees districts in their scope (not all districts)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "districts_select_assigned_or_staff" ON public.districts;

CREATE POLICY "districts_select_scoped"
  ON public.districts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin ()
    OR EXISTS (
      SELECT 1
      FROM public.regional_director_districts rdd
      WHERE rdd.user_id = auth.uid ()
        AND rdd.district_id = districts.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.locals l
      INNER JOIN public.local_assignments la
        ON la.local_id = l.id
        AND la.user_id = auth.uid ()
      WHERE l.district_id = districts.id
    )
  );

DROP POLICY IF EXISTS "districts_write_staff" ON public.districts;

CREATE POLICY "districts_write_super_admin"
  ON public.districts
  FOR ALL
  TO authenticated
  USING (public.is_super_admin ())
  WITH CHECK (public.is_super_admin ());

-- ---------------------------------------------------------------------------
-- Locals / bargaining_units writes: super admin only (was is_staff)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "locals_write_staff" ON public.locals;

CREATE POLICY "locals_write_super_admin"
  ON public.locals
  FOR ALL
  TO authenticated
  USING (public.is_super_admin ())
  WITH CHECK (public.is_super_admin ());

DROP POLICY IF EXISTS "bargaining_units_write_staff" ON public.bargaining_units;

CREATE POLICY "bargaining_units_write_super_admin"
  ON public.bargaining_units
  FOR ALL
  TO authenticated
  USING (public.is_super_admin ())
  WITH CHECK (public.is_super_admin ());

-- ---------------------------------------------------------------------------
-- Negotiations: insert + delete
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "negotiations_insert_accessible" ON public.negotiations;

CREATE POLICY "negotiations_insert_accessible"
  ON public.negotiations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.bargaining_units bu
        INNER JOIN public.locals l ON l.id = bu.local_id
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE bu.id = bargaining_unit_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.bargaining_units bu
      INNER JOIN public.local_assignments la
        ON la.local_id = bu.local_id
        AND la.user_id = auth.uid ()
      WHERE bu.id = bargaining_unit_id
    )
  );

DROP POLICY IF EXISTS "negotiations_delete_staff" ON public.negotiations;

CREATE POLICY "negotiations_delete_scoped"
  ON public.negotiations
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND public.user_can_access_negotiation (id)
    )
  );

-- ---------------------------------------------------------------------------
-- Proposals delete: staff clause → super_admin or regional director in scope
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "proposals_delete_accessible" ON public.proposals;

CREATE POLICY "proposals_delete_accessible"
  ON public.proposals
  FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_negotiation (negotiation_id)
    AND (
      status = 'draft'
      OR public.is_super_admin ()
      OR (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid ()
            AND p.role = 'regional_director'
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Master contracts: RD sees masters for locals in scoped districts only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "master_contracts_select_visible" ON public.master_contracts;

CREATE POLICY "master_contracts_select_visible"
  ON public.master_contracts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin ()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid ()
          AND p.role = 'regional_director'
      )
      AND EXISTS (
        SELECT 1
        FROM public.locals l
        INNER JOIN public.regional_director_districts rdd
          ON rdd.district_id = l.district_id
          AND rdd.user_id = auth.uid ()
        WHERE l.id = master_contracts.local_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.local_assignments la
      WHERE la.local_id = master_contracts.local_id
        AND la.user_id = auth.uid ()
    )
  );

-- Upgrade path: if master_contracts was created with bargaining_unit_id, move to local_id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'master_contracts'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_contracts'
      AND column_name = 'bargaining_unit_id'
  ) THEN
    DROP POLICY IF EXISTS "master_contracts_select_visible" ON public.master_contracts;
    DROP POLICY IF EXISTS "master_contracts_insert_super_admin" ON public.master_contracts;

    ALTER TABLE public.master_contracts DROP CONSTRAINT IF EXISTS master_contracts_bu_version;

    ALTER TABLE public.master_contracts
      ADD COLUMN local_id UUID REFERENCES public.locals (id) ON DELETE CASCADE;

    UPDATE public.master_contracts mc
    SET local_id = bu.local_id
    FROM public.bargaining_units bu
    WHERE bu.id = mc.bargaining_unit_id;

    ALTER TABLE public.master_contracts DROP COLUMN bargaining_unit_id;

    ALTER TABLE public.master_contracts ALTER COLUMN local_id SET NOT NULL;

    ALTER TABLE public.master_contracts
      ADD CONSTRAINT master_contracts_local_version UNIQUE (local_id, version_number);

    CREATE INDEX IF NOT EXISTS idx_master_contracts_local_id
      ON public.master_contracts (local_id);

    CREATE INDEX IF NOT EXISTS idx_master_contracts_local_version_desc
      ON public.master_contracts (local_id, version_number DESC);

    COMMENT ON TABLE public.master_contracts IS 'Canonical CBA text per local; new upload = new version row.';

    CREATE POLICY "master_contracts_select_visible"
      ON public.master_contracts
      FOR SELECT
      TO authenticated
      USING (
        public.is_super_admin()
        OR public.is_staff()
        OR EXISTS (
          SELECT 1
          FROM public.local_assignments la
          WHERE la.local_id = master_contracts.local_id
            AND la.user_id = auth.uid()
        )
      );

    CREATE POLICY "master_contracts_insert_super_admin"
      ON public.master_contracts
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_super_admin ());
  END IF;
END $$;

-- Immutable-style master agreement text per local (uploaded by super_admin).
-- body_html is derived from .txt for use in the contract editor pipeline.

CREATE OR REPLACE FUNCTION public.is_super_admin ()
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
      AND role = 'super_admin'
  );
$$;

CREATE TABLE public.master_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID NOT NULL REFERENCES public.locals (id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT master_contracts_version_positive CHECK (version_number >= 1),
  CONSTRAINT master_contracts_local_version UNIQUE (local_id, version_number)
);

CREATE INDEX idx_master_contracts_local_id
  ON public.master_contracts (local_id);

CREATE INDEX idx_master_contracts_local_version_desc
  ON public.master_contracts (local_id, version_number DESC);

COMMENT ON TABLE public.master_contracts IS 'Canonical CBA text per local; new upload = new version row.';

ALTER TABLE public.master_contracts ENABLE ROW LEVEL SECURITY;

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

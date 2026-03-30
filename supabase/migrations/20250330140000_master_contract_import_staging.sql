-- Staging for strict .docx import (analyze → preview → commit). Super-admin only.
-- Also adds optional import provenance on canonical master_contracts rows.

ALTER TABLE public.master_contracts
  ADD COLUMN IF NOT EXISTS import_metadata JSONB;

COMMENT ON COLUMN public.master_contracts.import_metadata IS
  'Optional JSON snapshot from structured import (e.g. original filename, validation, import mode).';

CREATE TABLE public.master_contract_import_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID NOT NULL REFERENCES public.locals (id) ON DELETE CASCADE,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_mode TEXT NOT NULL DEFAULT 'strict' CHECK (import_mode IN ('strict')),
  validation_result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_master_contract_import_staging_expires_at
  ON public.master_contract_import_staging (expires_at);

CREATE INDEX idx_master_contract_import_staging_local_id
  ON public.master_contract_import_staging (local_id);

COMMENT ON TABLE public.master_contract_import_staging IS
  'Holds normalized HTML between docx analyze and commit; preview HTML equals body_html here.';

ALTER TABLE public.master_contract_import_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_contract_import_staging_super_admin_all"
  ON public.master_contract_import_staging
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

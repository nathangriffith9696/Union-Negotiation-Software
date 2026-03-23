-- Negotiation contract text versions (rich HTML); foundation for future diff / proposal workflows.

CREATE TABLE public.negotiation_contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID NOT NULL REFERENCES public.negotiations (id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  body_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT negotiation_contract_versions_version_positive CHECK (version_number >= 1),
  CONSTRAINT negotiation_contract_versions_negotiation_version UNIQUE (negotiation_id, version_number)
);

CREATE INDEX idx_negotiation_contract_versions_negotiation_id
  ON public.negotiation_contract_versions (negotiation_id);

CREATE INDEX idx_negotiation_contract_versions_negotiation_version
  ON public.negotiation_contract_versions (negotiation_id, version_number DESC);

COMMENT ON TABLE public.negotiation_contract_versions IS 'Saved HTML snapshots of the negotiation contract; sequential versions per negotiation.';

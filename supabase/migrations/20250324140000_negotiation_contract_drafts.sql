-- Working draft per negotiation: continuous editing; formal checkpoints stay in negotiation_contract_versions.

CREATE TABLE public.negotiation_contract_drafts (
  negotiation_id UUID PRIMARY KEY REFERENCES public.negotiations (id) ON DELETE CASCADE,
  body_html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_negotiation_contract_drafts_updated_at
  ON public.negotiation_contract_drafts (updated_at DESC);

COMMENT ON TABLE public.negotiation_contract_drafts IS 'Current working contract HTML per negotiation; snapshots are negotiation_contract_versions.';

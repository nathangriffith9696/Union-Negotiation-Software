-- Links each negotiation to the master_contracts row used as the immutable "original"
-- baseline for the contract editor (seed + restore).

ALTER TABLE public.negotiations
  ADD COLUMN master_contract_id UUID REFERENCES public.master_contracts (id) ON DELETE SET NULL;

CREATE INDEX idx_negotiations_master_contract_id
  ON public.negotiations (master_contract_id)
  WHERE master_contract_id IS NOT NULL;

COMMENT ON COLUMN public.negotiations.master_contract_id IS
  'Frozen reference to the published master CBA row this negotiation started from; used to restore the working draft to original text.';

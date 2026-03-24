-- Rich proposal language for bargaining packets (TipTap / contract-editor HTML).
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS body_html TEXT;

COMMENT ON COLUMN public.proposals.body_html IS 'Formatted proposal language (HTML) for print and formal packets; optional internal notes may remain in summary.';

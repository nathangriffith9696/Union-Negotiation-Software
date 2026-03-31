-- "Restore to original" in the contract editor clears proposals and contract snapshot milestones.
-- Client DELETE on proposals is limited by RLS (draft-only for non-staff); this RPC runs as
-- definer after user_can_access_negotiation (same boundary as other negotiation-scoped writes).

CREATE OR REPLACE FUNCTION public.delete_all_proposals_for_negotiation_restore (
  p_negotiation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid () IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.user_can_access_negotiation (p_negotiation_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.negotiation_contract_versions
  WHERE negotiation_id = p_negotiation_id;

  DELETE FROM public.proposals
  WHERE negotiation_id = p_negotiation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_proposals_for_negotiation_restore (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_all_proposals_for_negotiation_restore (uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_all_proposals_for_negotiation_restore (uuid) IS
  'Restore to original: deletes contract snapshot milestones and all proposals for the negotiation.';

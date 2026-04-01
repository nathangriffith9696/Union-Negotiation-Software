-- When a new master CBA is published for the local, the negotiation is pointed at it from the client.
-- This RPC resets the working draft and snapshot milestones to that master in one transaction so
-- draft review baselines against the new text instead of old milestones (until the user had to
-- use "Restore to original" to align). It also removes all proposals for the negotiation, same
-- boundary as restore-to-original (RLS-safe via SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.sync_negotiation_workspace_to_master (
  p_negotiation_id uuid,
  p_master_contract_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id uuid;
  v_body text;
BEGIN
  IF auth.uid () IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.user_can_access_negotiation (p_negotiation_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT bu.local_id
  INTO v_local_id
  FROM public.negotiations n
  JOIN public.bargaining_units bu ON bu.id = n.bargaining_unit_id
  WHERE n.id = p_negotiation_id;

  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'negotiation has no bargaining unit';
  END IF;

  SELECT mc.body_html
  INTO v_body
  FROM public.master_contracts mc
  WHERE mc.id = p_master_contract_id
    AND mc.local_id = v_local_id;

  IF v_body IS NULL THEN
    RAISE EXCEPTION 'master contract not found for this local';
  END IF;

  UPDATE public.negotiations
  SET master_contract_id = p_master_contract_id
  WHERE id = p_negotiation_id;

  DELETE FROM public.proposals
  WHERE negotiation_id = p_negotiation_id;

  DELETE FROM public.negotiation_contract_versions
  WHERE negotiation_id = p_negotiation_id;

  INSERT INTO public.negotiation_contract_versions (
    negotiation_id,
    version_number,
    body_html
  )
  VALUES (
    p_negotiation_id,
    1,
    v_body
  );

  INSERT INTO public.negotiation_contract_drafts (
    negotiation_id,
    body_html,
    updated_at
  )
  VALUES (
    p_negotiation_id,
    v_body,
    now()
  )
  ON CONFLICT (negotiation_id) DO UPDATE
  SET
    body_html = EXCLUDED.body_html,
    updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_negotiation_workspace_to_master (uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_negotiation_workspace_to_master (uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_negotiation_workspace_to_master (uuid, uuid) IS
  'Point negotiation at a new master CBA: clear proposals, reset draft + snapshots to that text (version 1).';

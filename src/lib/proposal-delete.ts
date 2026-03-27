import type { TypedSupabaseClient } from "@/lib/supabase";

export function friendlyProposalDeleteError(err: {
  message: string;
  code?: string;
}): string {
  const msg = err.message.toLowerCase();
  const code = err.code ?? "";

  if (code === "42501" || msg.includes("permission denied") || msg.includes("rls")) {
    return "You do not have permission to delete this proposal. In Supabase, add a DELETE policy on public.proposals for your role (see project docs).";
  }
  if (code === "23503" || msg.includes("foreign key")) {
    return "This proposal could not be deleted because other records still reference it.";
  }

  return err.message.trim() || "Could not delete the proposal.";
}

/**
 * Hard-delete a **draft** only. Scoped by `negotiation_id` so IDs cannot cross negotiations.
 * Returns an error message if the row was not removed (RLS, wrong id, or not a draft).
 */
export async function deleteDraftProposalForNegotiation(
  supabase: TypedSupabaseClient,
  proposalId: string,
  negotiationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("proposals")
    .delete()
    .eq("id", proposalId.trim())
    .eq("negotiation_id", negotiationId.trim())
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: friendlyProposalDeleteError(error) };
  }
  if (!data) {
    return {
      ok: false,
      error:
        "No draft proposal was deleted. It may not exist, belong to another negotiation, or already be submitted.",
    };
  }
  return { ok: true };
}

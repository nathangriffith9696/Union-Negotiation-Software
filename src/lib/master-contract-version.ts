import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Next `version_number` for a local's master contracts: max existing + 1, or 1 if none.
 * Shared by txt upload and docx import commit routes.
 */
export async function getNextMasterContractVersionNumber(
  supabase: SupabaseClient<Database>,
  localId: string
): Promise<
  { ok: true; versionNumber: number } | { ok: false; message: string }
> {
  const { data: last, error } = await supabase
    .from("master_contracts")
    .select("version_number")
    .eq("local_id", localId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    versionNumber: (last?.version_number ?? 0) + 1,
  };
}

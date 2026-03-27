import type { TypedSupabaseClient } from "@/lib/supabase";
import type { AppRole, ProfileRow } from "@/types/database";

export type { AppRole };

/**
 * Loads the signed-in user's profile row (RLS: own row or staff).
 * Returns null if not signed in or no row (should not happen after trigger/backfill).
 */
export async function fetchMyProfile(
  supabase: TypedSupabaseClient
): Promise<ProfileRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, created_at, updated_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProfileRow;
}

export function formatAppRole(role: AppRole): string {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "regional_director":
      return "Regional director";
    case "field_rep":
      return "Field rep";
    default:
      return role;
  }
}

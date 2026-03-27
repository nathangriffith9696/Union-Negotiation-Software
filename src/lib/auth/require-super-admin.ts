import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export type SuperAdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Ensures the request is from a signed-in user whose profile role is super_admin.
 */
export async function requireSuperAdmin(): Promise<SuperAdminCheck> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, status: 401, message: "Not signed in." };
  }
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile) {
    return { ok: false, status: 403, message: "Profile not found." };
  }
  const role = profile.role as AppRole;
  if (role !== "super_admin") {
    return { ok: false, status: 403, message: "Super admin only." };
  }
  return { ok: true, userId: user.id };
}

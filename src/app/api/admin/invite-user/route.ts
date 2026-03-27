import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { AppRole } from "@/types/database";

const APP_ROLES: AppRole[] = [
  "super_admin",
  "regional_director",
  "field_rep",
];

function isAppRole(s: string): s is AppRole {
  return (APP_ROLES as readonly string[]).includes(s);
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const email =
    typeof (payload as { email?: unknown }).email === "string"
      ? (payload as { email: string }).email.trim().toLowerCase()
      : "";
  const roleRaw =
    typeof (payload as { role?: unknown }).role === "string"
      ? (payload as { role: string }).role.trim()
      : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }
  if (!isAppRole(roleRaw)) {
    return NextResponse.json(
      {
        error:
          "role must be one of: super_admin, regional_director, field_rep.",
      },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = createSupabaseServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Server is not configured with SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 }
    );
  }

  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;

  const redirectTo = `${origin}/auth/callback`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: typeof error.status === "number" ? error.status : 400 }
    );
  }

  const userId = data.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "Invite did not return a user id." },
      { status: 500 }
    );
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ role: roleRaw })
    .eq("id", userId);

  if (profileErr) {
    return NextResponse.json(
      {
        error: `User was invited but updating their role failed: ${profileErr.message}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, userId });
}

import { NextResponse, type NextRequest } from "next/server";
import { DELETE_USER_CONFIRMATION_PHRASE } from "@/lib/admin-delete-user-constants";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const userId =
    typeof (payload as { userId?: unknown }).userId === "string"
      ? (payload as { userId: string }).userId.trim()
      : "";
  const confirmation =
    typeof (payload as { confirmation?: unknown }).confirmation === "string"
      ? (payload as { confirmation: string }).confirmation.trim()
      : "";

  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json(
      { error: "A valid user id is required." },
      { status: 400 }
    );
  }

  if (userId === gate.userId) {
    return NextResponse.json(
      {
        error:
          "You cannot delete your own account while signed in. Use another super admin or the Supabase dashboard.",
      },
      { status: 400 }
    );
  }

  if (confirmation !== DELETE_USER_CONFIRMATION_PHRASE) {
    return NextResponse.json(
      {
        error: `Confirmation must be exactly: ${DELETE_USER_CONFIRMATION_PHRASE}`,
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

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: typeof error.status === "number" ? error.status : 400 }
    );
  }

  return NextResponse.json({ ok: true as const });
}

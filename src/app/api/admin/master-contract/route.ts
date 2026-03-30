import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { contractTextToHtml } from "@/lib/master-contract-html";
import { getNextMasterContractVersionNumber } from "@/lib/master-contract-version";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  const localId =
    typeof (payload as { localId?: unknown }).localId === "string"
      ? (payload as { localId: string }).localId.trim()
      : "";
  const bodyText =
    typeof (payload as { bodyText?: unknown }).bodyText === "string"
      ? (payload as { bodyText: string }).bodyText
      : "";
  const fileName =
    typeof (payload as { fileName?: unknown }).fileName === "string"
      ? (payload as { fileName: string }).fileName.trim() || null
      : null;

  if (!localId) {
    return NextResponse.json(
      { error: "localId is required." },
      { status: 400 }
    );
  }
  if (!bodyText.trim()) {
    return NextResponse.json(
      { error: "bodyText must not be empty." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const body_html = contractTextToHtml(bodyText);

  const nextVer = await getNextMasterContractVersionNumber(supabase, localId);
  if (!nextVer.ok) {
    return NextResponse.json({ error: nextVer.message }, { status: 400 });
  }
  const version_number = nextVer.versionNumber;

  const { data: inserted, error: insErr } = await supabase
    .from("master_contracts")
    .insert({
      local_id: localId,
      version_number,
      body_text: bodyText,
      body_html,
      file_name: fileName,
      created_by: gate.userId,
    })
    .select("id, version_number")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true as const, ...inserted });
}

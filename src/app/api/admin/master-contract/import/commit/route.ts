import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { htmlToPlainText } from "@/lib/master-contract-import/html-to-plain-text";
import type { ImportValidationResult, MasterContractImportMetadata } from "@/lib/master-contract-import/types";
import {
  extractImportStats,
  validateContractImport,
} from "@/lib/master-contract-import/validate-import";
import { getNextMasterContractVersionNumber } from "@/lib/master-contract-version";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MasterContractImportStagingRow } from "@/types/database";

export const runtime = "nodejs";

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

  const stagingId =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { stagingId?: unknown }).stagingId === "string"
      ? (payload as { stagingId: string }).stagingId.trim()
      : "";

  if (!stagingId) {
    return NextResponse.json({ error: "stagingId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: staging, error: fetchErr } = await supabase
    .from("master_contract_import_staging")
    .select("*")
    .eq("id", stagingId)
    .maybeSingle();

  if (fetchErr || !staging) {
    return NextResponse.json(
      { error: "Staging import not found." },
      { status: 404 }
    );
  }

  const st = staging as MasterContractImportStagingRow;

  if (new Date(st.expires_at).getTime() <= Date.now()) {
    await supabase
      .from("master_contract_import_staging")
      .delete()
      .eq("id", stagingId);
    return NextResponse.json(
      { error: "Staging import expired." },
      { status: 404 }
    );
  }

  const storedValidation = st.validation_result as ImportValidationResult;
  const emptyRemoved =
    typeof storedValidation?.stats?.emptyParagraphsRemoved === "number"
      ? storedValidation.stats.emptyParagraphsRemoved
      : 0;

  const stats = {
    ...extractImportStats(st.body_html),
    emptyParagraphsRemoved: emptyRemoved,
  };
  const bodyText = htmlToPlainText(st.body_html);
  const revalidation = validateContractImport(
    st.body_html,
    bodyText,
    stats
  );

  if (!revalidation.ok) {
    return NextResponse.json(
      {
        error: "Stored HTML no longer passes validation.",
        validation: revalidation,
      },
      { status: 400 }
    );
  }

  const nextVer = await getNextMasterContractVersionNumber(
    supabase,
    st.local_id
  );
  if (!nextVer.ok) {
    return NextResponse.json({ error: nextVer.message }, { status: 400 });
  }

  const committedAt = new Date().toISOString();

  const import_metadata: MasterContractImportMetadata = {
    source: "docx_import",
    import_mode: "strict",
    original_filename: st.original_filename,
    staged_import_id: st.id,
    analyzed_at: st.created_at,
    committed_at: committedAt,
    validation: storedValidation,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("master_contracts")
    .insert({
      local_id: st.local_id,
      version_number: nextVer.versionNumber,
      body_text: st.body_text,
      body_html: st.body_html,
      file_name: st.original_filename,
      created_by: gate.userId,
      import_metadata: import_metadata as unknown as Record<string, unknown>,
    })
    .select("id, version_number")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "Insert failed." },
      { status: 400 }
    );
  }

  await supabase
    .from("master_contract_import_staging")
    .delete()
    .eq("id", stagingId);

  return NextResponse.json({
    ok: true as const,
    masterContractId: inserted.id,
    versionNumber: inserted.version_number,
    localId: st.local_id,
  });
}

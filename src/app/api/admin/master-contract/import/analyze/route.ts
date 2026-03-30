import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  MAX_DOCX_BYTES,
  runStrictImportPipeline,
} from "@/lib/master-contract-import";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 }
    );
  }

  const localIdRaw = formData.get("localId");
  const file = formData.get("file");

  const localId =
    typeof localIdRaw === "string" ? localIdRaw.trim() : "";
  if (!localId) {
    return NextResponse.json({ error: "localId is required." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { error: "Only .docx files are supported." },
      { status: 400 }
    );
  }

  if (file.size > MAX_DOCX_BYTES) {
    return NextResponse.json({ error: "File is too large." }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();

  let pipelineResult;
  try {
    pipelineResult = await runStrictImportPipeline(arrayBuffer);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Could not read the Word document.",
      },
      { status: 400 }
    );
  }

  const { body_html, body_text, validation } = pipelineResult;

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Import validation failed.",
        validation,
      },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: row, error: insErr } = await supabase
    .from("master_contract_import_staging")
    .insert({
      local_id: localId,
      body_html,
      body_text,
      original_filename: file.name,
      uploaded_by: gate.userId,
      import_mode: "strict",
      validation_result: validation as unknown as Record<string, unknown>,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (insErr || !row) {
    return NextResponse.json(
      { error: insErr?.message ?? "Staging failed." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    stagingId: row.id,
    previewHtml: body_html,
    bodyText: body_text,
    validation,
    expiresAt: row.expires_at,
  });
}

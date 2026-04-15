"use client";

import { useEffect, useState } from "react";
import {
  type EntityListStatus,
  ListEmptyCard,
  ListErrorCard,
  ListLoadingCard,
} from "@/components/entity-list/EntityListStates";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  documentsMockForUi,
  getBargainingUnitById,
  getDistrictById,
  getLocalById,
  getNegotiationById,
  proposals,
  sessions,
} from "@/data/mock";
import {
  formatDate,
  formatFileSize,
  formatStatus,
  normalizeByteSize,
} from "@/lib/format";
import {
  labelsFromNegotiationsRelation,
  optionalEmbedTitle,
} from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { DocumentType } from "@/types/database";

type DocumentCardVM = {
  id: string;
  fileName: string;
  documentType: DocumentType;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
  sessionTitle: string | null;
  proposalTitle: string | null;
};

type DocumentWithRelationsRow = {
  id: string;
  file_name: string;
  document_type: DocumentType;
  mime_type: string;
  byte_size: number | string;
  uploaded_at: string;
  negotiations: {
    title: string;
    bargaining_units:
      | {
          name: string;
          locals: {
            name: string;
            districts: { name: string } | { name: string }[] | null;
          } | null;
        }
      | {
          name: string;
          locals: {
            name: string;
            districts: { name: string } | { name: string }[] | null;
          } | null;
        }[]
      | null;
  } | null;
  sessions: { title: string } | { title: string }[] | null;
  proposals: { title: string } | { title: string }[] | null;
};

function buildMockRows(): DocumentCardVM[] {
  return documentsMockForUi.map((d) => {
    const neg = getNegotiationById(d.negotiationId);
    const bu = neg ? getBargainingUnitById(neg.bargainingUnitId) : undefined;
    const local = bu ? getLocalById(bu.localId) : undefined;
    const district = local ? getDistrictById(local.districtId) : undefined;

    const sessionTitle = d.sessionId
      ? sessions.find((s) => s.id === d.sessionId)?.title ?? null
      : null;
    const proposalTitle = d.proposalId
      ? proposals.find((p) => p.id === d.proposalId)?.title ?? null
      : null;

    return {
      id: d.id,
      fileName: d.fileName,
      documentType: d.documentType,
      mimeType: d.mimeType,
      byteSize: d.byteSize,
      uploadedAt: d.uploadedAt,
      negotiationTitle: neg?.title ?? "Unknown negotiation",
      bargainingUnitName: bu?.name ?? "Unknown unit",
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
      sessionTitle,
      proposalTitle,
    };
  });
}

function mapSupabaseRow(row: DocumentWithRelationsRow): DocumentCardVM {
  const chain = labelsFromNegotiationsRelation(row.negotiations);
  return {
    id: row.id,
    fileName: row.file_name,
    documentType: row.document_type,
    mimeType: row.mime_type,
    byteSize: normalizeByteSize(row.byte_size),
    uploadedAt: row.uploaded_at,
    negotiationTitle: chain.negotiationTitle,
    bargainingUnitName: chain.bargainingUnitName,
    localName: chain.localName,
    districtName: chain.districtName,
    sessionTitle: optionalEmbedTitle(row.sessions),
    proposalTitle: optionalEmbedTitle(row.proposals),
  };
}

export default function DocumentsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<DocumentCardVM[]>(() =>
    supabaseOn ? [] : buildMockRows()
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setRows(buildMockRows());
      setStatus("ready");
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase
          .from("documents")
          .select(
            `
            id,
            file_name,
            document_type,
            mime_type,
            byte_size,
            uploaded_at,
            negotiations (
              title,
              bargaining_units (
                name,
                locals (
                  name,
                  districts ( name )
                )
              )
            ),
            sessions ( title ),
            proposals ( title )
          `
          )
          .order("uploaded_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as unknown as DocumentWithRelationsRow[];
        const list = typed.map(mapSupabaseRow);

        setRows(list);
        setStatus(list.length === 0 ? "empty" : "ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof Error ? e.message : "Something went wrong");
        setStatus("error");
        setRows([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Files linked to negotiations, with optional session or proposal context."
      />

      {status === "loading" ? <ListLoadingCard noun="documents" /> : null}

      {status === "error" && errorMessage ? (
        <ListErrorCard noun="documents" message={errorMessage} />
      ) : null}

      {status === "empty" ? <ListEmptyCard noun="documents" /> : null}

      {status === "ready" ? (
        <div className="space-y-6">
          {rows.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  {d.fileName}
                </h2>
                <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {formatStatus(d.documentType)}
                </span>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Document type
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatStatus(d.documentType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      MIME type
                    </dt>
                    <dd className="mt-1 break-all text-slate-700">{d.mimeType}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      File size
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatFileSize(d.byteSize)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Uploaded date
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatDate(d.uploadedAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Negotiation
                    </dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {d.negotiationTitle}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Bargaining unit · Local · District
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {d.bargainingUnitName} · {d.localName} · {d.districtName}
                    </dd>
                  </div>
                  {d.sessionTitle ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Session
                      </dt>
                      <dd className="mt-1 text-slate-700">{d.sessionTitle}</dd>
                    </div>
                  ) : null}
                  {d.proposalTitle ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proposal
                      </dt>
                      <dd className="mt-1 text-slate-700">{d.proposalTitle}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

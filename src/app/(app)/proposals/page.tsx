"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  type EntityListStatus,
  ListEmptyCard,
  ListErrorCard,
  ListLoadingCard,
} from "@/components/entity-list/EntityListStates";
import { ProposalSaveTracePanel } from "@/components/debug/ProposalSaveTracePanel";
import { ProposalsPrintDocument } from "@/components/proposals/ProposalsPrintDocument";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getBargainingUnitById,
  getDistrictById,
  getLocalById,
  getNegotiationById,
  proposalsMockForUi,
} from "@/data/mock";
import { formatDate, formatStatus } from "@/lib/format";
import { sortProposalsBargainingOrder } from "@/lib/proposal-article-sort";
import { isLikelyNegotiationUuid } from "@/lib/negotiation-id";
import { labelsFromNegotiationsRelation } from "@/lib/supabase-embeds";
import { deleteDraftProposalForNegotiation } from "@/lib/proposal-delete";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { ProposalStatus, ProposingParty } from "@/types/database";

type ProposalCardVM = {
  id: string;
  negotiationId: string;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string | null;
  bodyHtml: string | null;
  versionLabel: string | null;
  proposingParty: ProposingParty;
  submittedAt: string | null;
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
  createdAt: string;
};

type ProposalWithRelationsRow = {
  id: string;
  negotiation_id: string;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string | null;
  body_html: string | null;
  version_label: string | null;
  proposing_party: ProposingParty;
  submitted_at: string | null;
  created_at: string;
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
};

function buildMockRows(negotiationId: string | null): ProposalCardVM[] {
  const source =
    negotiationId && negotiationId.length > 0
      ? proposalsMockForUi.filter((p) => p.negotiationId === negotiationId)
      : proposalsMockForUi;

  return source.map((p) => {
    const neg = getNegotiationById(p.negotiationId);
    const bu = neg ? getBargainingUnitById(neg.bargainingUnitId) : undefined;
    const local = bu ? getLocalById(bu.localId) : undefined;
    const district = local ? getDistrictById(local.districtId) : undefined;

    return {
      id: p.id,
      negotiationId: p.negotiationId,
      title: p.title,
      category: p.category,
      status: p.status,
      summary: p.summary,
      bodyHtml: p.bodyHtml ?? null,
      versionLabel: p.versionLabel,
      proposingParty: p.proposingParty,
      submittedAt: p.submittedAt,
      negotiationTitle: neg?.title ?? "Unknown negotiation",
      bargainingUnitName: bu?.name ?? "Unknown unit",
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
      createdAt: p.createdAt,
    };
  });
}

function mapSupabaseRow(row: ProposalWithRelationsRow): ProposalCardVM {
  const chain = labelsFromNegotiationsRelation(row.negotiations);
  return {
    id: row.id,
    negotiationId: row.negotiation_id,
    title: row.title,
    category: row.category,
    status: row.status,
    summary: row.summary,
    bodyHtml: row.body_html,
    versionLabel: row.version_label,
    proposingParty: row.proposing_party,
    submittedAt: row.submitted_at,
    negotiationTitle: chain.negotiationTitle,
    bargainingUnitName: chain.bargainingUnitName,
    localName: chain.localName,
    districtName: chain.districtName,
    createdAt: row.created_at,
  };
}

function ProposalsPageContent() {
  const searchParams = useSearchParams();
  const negotiationScopeRaw = searchParams.get("negotiation")?.trim() ?? "";
  const negotiationScope =
    negotiationScopeRaw.length > 0 ? negotiationScopeRaw : null;
  const scopeIsUuid =
    negotiationScope != null && isLikelyNegotiationUuid(negotiationScope);

  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<ProposalCardVM[]>(() =>
    supabaseOn ? [] : buildMockRows(negotiationScope)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [printGeneratedAtIso, setPrintGeneratedAtIso] = useState(() =>
    new Date().toISOString()
  );
  const printRafRef = useRef<number | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [mockDeletedProposalIds, setMockDeletedProposalIds] = useState<
    Set<string>
  >(() => new Set());
  const [proposalDeletingId, setProposalDeletingId] = useState<string | null>(
    null
  );
  const [proposalDeleteError, setProposalDeleteError] = useState<string | null>(
    null
  );

  function handlePrintProposals() {
    setPrintGeneratedAtIso(new Date().toISOString());
    if (printRafRef.current != null) {
      cancelAnimationFrame(printRafRef.current);
    }
    printRafRef.current = requestAnimationFrame(() => {
      printRafRef.current = null;
      window.print();
    });
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const built = buildMockRows(negotiationScope).filter(
        (p) => !mockDeletedProposalIds.has(p.id)
      );
      setRows(built);
      setStatus(built.length === 0 ? "empty" : "ready");
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    (async () => {
      try {
        const supabase = createSupabaseClient();
        let query = supabase
          .from("proposals")
          .select(
            `
            id,
            negotiation_id,
            title,
            category,
            status,
            summary,
            body_html,
            version_label,
            proposing_party,
            submitted_at,
            created_at,
            negotiations (
              title,
              bargaining_units (
                name,
                locals (
                  name,
                  districts ( name )
                )
              )
            )
          `
          );

        if (scopeIsUuid) {
          query = query.eq("negotiation_id", negotiationScope!);
        }

        const { data, error } = await query;

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as ProposalWithRelationsRow[];
        const mapped = typed.map(mapSupabaseRow);
        const list = scopeIsUuid
          ? sortProposalsBargainingOrder(mapped)
          : [...mapped].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
  }, [negotiationScope, scopeIsUuid, listRefreshKey, mockDeletedProposalIds]);

  async function handleDeleteDraftProposal(p: ProposalCardVM) {
    if (p.status !== "draft") return;
    if (
      !confirm(
        `Delete draft proposal “${p.title}”? This cannot be undone. Session links and proposal references on notes or files will be cleared.`
      )
    ) {
      return;
    }
    setProposalDeleteError(null);
    if (!isSupabaseConfigured()) {
      setMockDeletedProposalIds((prev) => new Set([...prev, p.id]));
      setListRefreshKey((k) => k + 1);
      return;
    }
    setProposalDeletingId(p.id);
    try {
      const supabase = createSupabaseClient();
      const result = await deleteDraftProposalForNegotiation(
        supabase,
        p.id,
        p.negotiationId
      );
      if (!result.ok) {
        setProposalDeleteError(result.error);
        return;
      }
      setListRefreshKey((k) => k + 1);
    } finally {
      setProposalDeletingId(null);
    }
  }

  const scopedDescription =
    negotiationScope != null
      ? scopeIsUuid || !supabaseOn
        ? "Showing proposals for this negotiation only. Print applies to the list below."
        : "Add a valid negotiation id to the URL to filter (e.g. ?negotiation=<uuid>), or open Proposals from a negotiation."
      : "All contract proposals by negotiation, unit, and district.";

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={
            negotiationScope != null ? "Proposals (this negotiation)" : "Proposals"
          }
          description={
            <span className="flex flex-col gap-2 sm:block sm:space-y-0">
              <span>{scopedDescription}</span>
              {negotiationScope != null ? (
                <Link
                  href="/proposals"
                  className="font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-950"
                >
                  Show all proposals
                </Link>
              ) : null}
            </span>
          }
        />

        {status === "loading" ? <ListLoadingCard noun="proposals" /> : null}

        {status === "error" && errorMessage ? (
          <ListErrorCard noun="proposals" message={errorMessage} />
        ) : null}

        {proposalDeleteError ? (
          <Card className="mb-4 border-red-200 bg-red-50/80 print:hidden">
            <p className="text-sm text-red-800/95">{proposalDeleteError}</p>
          </Card>
        ) : null}

        {status === "empty" ? (
          negotiationScope != null ? (
            <Card>
              <p className="text-sm text-slate-600">
                No proposals for this negotiation yet.
              </p>
            </Card>
          ) : (
            <ListEmptyCard noun="proposals" />
          )
        ) : null}
      </div>

      {status === "ready" ? (
        <>
          <div className="mb-6 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Print a clean packet for the bargaining table (browser print or
              save as PDF).
            </p>
            <button
              type="button"
              onClick={() => handlePrintProposals()}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
            >
              Print proposals
            </button>
          </div>

          <div className="space-y-6 print:hidden">
            {rows.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {p.title}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {p.negotiationTitle}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {p.bargainingUnitName} · {p.localName} ·{" "}
                      {p.districtName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                    <span className="self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 sm:self-end">
                      {formatStatus(p.status)}
                    </span>
                    {p.status === "draft" ? (
                      <button
                        type="button"
                        disabled={proposalDeletingId === p.id}
                        onClick={() => void handleDeleteDraftProposal(p)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {proposalDeletingId === p.id ? "Deleting…" : "Delete draft"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Category
                      </dt>
                      <dd className="mt-1 text-slate-700">{p.category}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {formatStatus(p.status)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proposing party
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {formatStatus(p.proposingParty)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Submitted date
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {p.submittedAt ? formatDate(p.submittedAt) : "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Version label
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {p.versionLabel?.trim() ? p.versionLabel : "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proposal language
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {p.bodyHtml?.trim() ? (
                          <div
                            className="contract-editor-rich-preview max-h-[min(40vh,18rem)] overflow-y-auto rounded-md border border-slate-100 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900"
                            // Saved from our editors; same trust model as the bargaining packet.
                            dangerouslySetInnerHTML={{
                              __html: p.bodyHtml.trim(),
                            }}
                          />
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Internal notes
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-700">
                        {p.summary?.trim() ? p.summary : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </Card>
            ))}
          </div>

          <ProposalsPrintDocument
            rows={rows}
            generatedAtIso={printGeneratedAtIso}
          />
        </>
      ) : null}

      <ProposalSaveTracePanel
        rows={rows.map((p) => ({
          id: p.id,
          bodyHtml: p.bodyHtml,
          title: p.title,
        }))}
        listReady={status === "ready" || status === "empty"}
      />
    </>
  );
}

export default function ProposalsPage() {
  return (
    <Suspense fallback={<ListLoadingCard noun="proposals" />}>
      <ProposalsPageContent />
    </Suspense>
  );
}

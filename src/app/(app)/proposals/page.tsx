"use client";

import { useEffect, useState } from "react";
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
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { ProposalStatus, ProposingParty } from "@/types/database";

type ProposalCardVM = {
  id: string;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string | null;
  versionLabel: string | null;
  proposingParty: ProposingParty;
  submittedAt: string | null;
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
};

type ProposalWithRelationsRow = {
  id: string;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string | null;
  version_label: string | null;
  proposing_party: ProposingParty;
  submitted_at: string | null;
  negotiations: {
    title: string;
    bargaining_units: {
      name: string;
      locals: {
        name: string;
        districts: { name: string } | { name: string }[] | null;
      } | null;
    } | null;
  } | null;
};

function districtNameFromEmbed(
  d: { name: string } | { name: string }[] | null | undefined
): string {
  if (!d) return "Unknown district";
  if (Array.isArray(d)) {
    return d[0]?.name ?? "Unknown district";
  }
  return d.name ?? "Unknown district";
}

function buildMockRows(): ProposalCardVM[] {
  return proposalsMockForUi.map((p) => {
    const neg = getNegotiationById(p.negotiationId);
    const bu = neg ? getBargainingUnitById(neg.bargainingUnitId) : undefined;
    const local = bu ? getLocalById(bu.localId) : undefined;
    const district = local ? getDistrictById(local.districtId) : undefined;

    return {
      id: p.id,
      title: p.title,
      category: p.category,
      status: p.status,
      summary: p.summary,
      versionLabel: p.versionLabel,
      proposingParty: p.proposingParty,
      submittedAt: p.submittedAt,
      negotiationTitle: neg?.title ?? "Unknown negotiation",
      bargainingUnitName: bu?.name ?? "Unknown unit",
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
    };
  });
}

function mapSupabaseRow(row: ProposalWithRelationsRow): ProposalCardVM {
  const neg = row.negotiations;
  const bu = neg?.bargaining_units;
  const loc = bu?.locals;

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    summary: row.summary,
    versionLabel: row.version_label,
    proposingParty: row.proposing_party,
    submittedAt: row.submitted_at,
    negotiationTitle: neg?.title ?? "Unknown negotiation",
    bargainingUnitName: bu?.name ?? "Unknown unit",
    localName: loc?.name ?? "Unknown local",
    districtName: loc ? districtNameFromEmbed(loc.districts) : "Unknown district",
  };
}

export default function ProposalsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<
    "loading" | "ready" | "empty" | "error"
  >(() => (supabaseOn ? "loading" : "ready"));
  const [rows, setRows] = useState<ProposalCardVM[]>(() =>
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
          .from("proposals")
          .select(
            `
            id,
            title,
            category,
            status,
            summary,
            version_label,
            proposing_party,
            submitted_at,
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
          )
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as ProposalWithRelationsRow[];
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
        title="Proposals"
        description="Contract proposals by negotiation, unit, and district."
      />

      {status === "loading" ? (
        <Card>
          <p className="text-sm text-slate-600">Loading proposals…</p>
        </Card>
      ) : null}

      {status === "error" && errorMessage ? (
        <Card className="border-red-200 bg-red-50/80">
          <p className="text-sm font-medium text-red-900">
            Could not load proposals
          </p>
          <p className="mt-2 text-sm text-red-800/90">{errorMessage}</p>
        </Card>
      ) : null}

      {status === "empty" ? (
        <Card>
          <p className="text-sm text-slate-600">
            No proposals yet. Add rows in Supabase or use mock data by leaving
            env vars unset.
          </p>
        </Card>
      ) : null}

      {status === "ready" ? (
        <div className="space-y-6">
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
                    {p.bargainingUnitName} · {p.localName} · {p.districtName}
                  </p>
                </div>
                <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {formatStatus(p.status)}
                </span>
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
                      Summary
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {p.summary?.trim() ? p.summary : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

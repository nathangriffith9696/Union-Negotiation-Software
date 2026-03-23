"use client";

import Link from "next/link";
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
  getBargainingUnitById,
  getDistrictById,
  getLocalById,
  negotiationsMock,
} from "@/data/mock";
import { formatOptionalDate, formatStatus } from "@/lib/format";
import { labelsFromNegotiationsRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { NegotiationStatus, NegotiationType } from "@/types/database";

type NegotiationRowVM = {
  id: string;
  title: string;
  status: NegotiationStatus;
  negotiationType: NegotiationType;
  startedOn: string | null;
  targetContractEffectiveDate: string | null;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
};

type NegotiationWithRelationsRow = {
  id: string;
  title: string;
  status: NegotiationStatus;
  negotiation_type: NegotiationType;
  started_on: string | null;
  target_contract_effective_date: string | null;
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
};

function buildMockRows(): NegotiationRowVM[] {
  return negotiationsMock.map((n) => {
    const bu = getBargainingUnitById(n.bargainingUnitId);
    const local = bu ? getLocalById(bu.localId) : undefined;
    const district = local ? getDistrictById(local.districtId) : undefined;
    return {
      id: n.id,
      title: n.title,
      status: n.status,
      negotiationType: n.negotiationType,
      startedOn: n.startedOn,
      targetContractEffectiveDate: n.targetContractEffectiveDate,
      bargainingUnitName: bu?.name ?? "Unknown unit",
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
    };
  });
}

function mapSupabaseRow(row: NegotiationWithRelationsRow): NegotiationRowVM {
  const chain = labelsFromNegotiationsRelation({
    title: row.title,
    bargaining_units: row.bargaining_units,
  });
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    negotiationType: row.negotiation_type,
    startedOn: row.started_on,
    targetContractEffectiveDate: row.target_contract_effective_date,
    bargainingUnitName: chain.bargainingUnitName,
    localName: chain.localName,
    districtName: chain.districtName,
  };
}

export default function NegotiationsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<NegotiationRowVM[]>(() =>
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
          .from("negotiations")
          .select(
            `
            id,
            title,
            status,
            negotiation_type,
            started_on,
            target_contract_effective_date,
            bargaining_units (
              name,
              locals (
                name,
                districts ( name )
              )
            )
          `
          )
          .order("title");

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as NegotiationWithRelationsRow[];
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
        title="Negotiations"
        description="Contract negotiation cycles by bargaining unit, local, and district."
      />

      {status === "loading" ? (
        <ListLoadingCard noun="negotiations" />
      ) : null}

      {status === "error" && errorMessage ? (
        <ListErrorCard noun="negotiations" message={errorMessage} />
      ) : null}

      {status === "empty" ? <ListEmptyCard noun="negotiations" /> : null}

      {status === "ready" ? (
        <div className="space-y-6">
          {rows.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Link
                    href={`/negotiations/${encodeURIComponent(n.id)}`}
                    className="block text-lg font-semibold text-slate-900 hover:text-slate-700 hover:underline"
                  >
                    {n.title}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    {n.bargainingUnitName} · {n.localName} · {n.districtName}
                  </p>
                </div>
                <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {formatStatus(n.status)}
                </span>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Negotiation type
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatStatus(n.negotiationType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Started
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatOptionalDate(n.startedOn) ?? "—"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Target contract effective
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatOptionalDate(n.targetContractEffectiveDate) ?? "—"}
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

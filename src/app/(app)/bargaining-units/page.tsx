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
  bargainingUnits as mockBargainingUnits,
  getDistrictById,
  locals as mockLocals,
} from "@/data/mock";
import { labelsFromLocalRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type UnitRowVM = {
  id: string;
  name: string;
  description: string;
  employerName: string;
  localName: string;
  districtName: string;
};

type BargainingUnitWithRelationsRow = {
  id: string;
  name: string;
  description: string | null;
  employer_name: string;
  locals:
    | {
        name: string;
        districts: { name: string } | { name: string }[] | null;
      }
    | {
        name: string;
        districts: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

function buildMockRows(): UnitRowVM[] {
  return mockBargainingUnits.map((u) => {
    const local = mockLocals.find((l) => l.id === u.localId);
    const district = local ? getDistrictById(local.districtId) : null;
    return {
      id: u.id,
      name: u.name,
      description: u.description,
      employerName: u.employerName,
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
    };
  });
}

function mapSupabaseRow(row: BargainingUnitWithRelationsRow): UnitRowVM {
  const { localName, districtName } = labelsFromLocalRelation(row.locals);

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    employerName: row.employer_name,
    localName,
    districtName,
  };
}

export default function BargainingUnitsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<UnitRowVM[]>(() =>
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
          .from("bargaining_units")
          .select(
            `
            id,
            name,
            description,
            employer_name,
            locals (
              name,
              districts ( name )
            )
          `
          )
          .order("name");

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as BargainingUnitWithRelationsRow[];
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
        title="Bargaining units"
        description="Bargaining units with their chartered local and district."
      />

      {status === "loading" ? (
        <ListLoadingCard noun="bargaining units" />
      ) : null}

      {status === "error" && errorMessage ? (
        <ListErrorCard noun="bargaining units" message={errorMessage} />
      ) : null}

      {status === "empty" ? (
        <ListEmptyCard noun="bargaining units" />
      ) : null}

      {status === "ready" ? (
        <div className="space-y-6">
          {rows.map((u) => (
            <Card key={u.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {u.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {u.localName} · {u.districtName}
                  </p>
                </div>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employer
                </h3>
                <p className="mt-2 text-sm text-slate-700">{u.employerName}</p>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </h3>
                <p className="mt-2 text-sm text-slate-600 line-clamp-3">
                  {u.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  bargainingUnits as mockBargainingUnits,
  getDistrictById,
  locals as mockLocals,
} from "@/data/mock";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type UnitVM = {
  id: string;
  name: string;
  description: string;
  employerName: string;
};

type LocalRowVM = {
  id: string;
  name: string;
  charterNumber: string;
  memberCount: number;
  districtName: string;
  units: UnitVM[];
};

/** Embed shape for `locals` + `districts` + `bargaining_units`. */
type LocalWithRelationsRow = {
  id: string;
  name: string;
  charter_number: string;
  member_count: number;
  districts: { name: string } | { name: string }[] | null;
  bargaining_units:
    | {
        id: string;
        name: string;
        description: string | null;
        employer_name: string;
      }[]
    | {
        id: string;
        name: string;
        description: string | null;
        employer_name: string;
      }
    | null;
};

function buildMockRows(): LocalRowVM[] {
  return mockLocals.map((l) => {
    const district = getDistrictById(l.districtId);
    const units = mockBargainingUnits
      .filter((b) => b.localId === l.id)
      .map((u) => ({
        id: u.id,
        name: u.name,
        description: u.description,
        employerName: u.employerName,
      }));
    return {
      id: l.id,
      name: l.name,
      charterNumber: l.charterNumber,
      memberCount: l.memberCount,
      districtName: district?.name ?? "Unknown district",
      units,
    };
  });
}

function districtNameFromEmbed(
  d: LocalWithRelationsRow["districts"]
): string {
  if (!d) return "Unknown district";
  if (Array.isArray(d)) {
    return d[0]?.name ?? "Unknown district";
  }
  return d.name ?? "Unknown district";
}

function unitsFromEmbed(
  u: LocalWithRelationsRow["bargaining_units"]
): UnitVM[] {
  if (!u) return [];
  const list = Array.isArray(u) ? u : [u];
  return list
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      employerName: row.employer_name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function LocalsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<
    "loading" | "ready" | "empty" | "error"
  >(() => (supabaseOn ? "loading" : "ready"));
  const [rows, setRows] = useState<LocalRowVM[]>(() =>
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
          .from("locals")
          .select(
            `
            id,
            name,
            charter_number,
            member_count,
            districts ( name ),
            bargaining_units (
              id,
              name,
              description,
              employer_name
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

        const typed = (data ?? []) as LocalWithRelationsRow[];
        const list: LocalRowVM[] = typed.map((row) => ({
          id: row.id,
          name: row.name,
          charterNumber: row.charter_number,
          memberCount: row.member_count,
          districtName: districtNameFromEmbed(row.districts),
          units: unitsFromEmbed(row.bargaining_units),
        }));

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
        title="Locals"
        description="Chartered locals, member counts, and associated bargaining units."
      />

      {status === "loading" ? (
        <Card>
          <p className="text-sm text-slate-600">Loading locals…</p>
        </Card>
      ) : null}

      {status === "error" && errorMessage ? (
        <Card className="border-red-200 bg-red-50/80">
          <p className="text-sm font-medium text-red-900">
            Could not load locals
          </p>
          <p className="mt-2 text-sm text-red-800/90">{errorMessage}</p>
        </Card>
      ) : null}

      {status === "empty" ? (
        <Card>
          <p className="text-sm text-slate-600">
            No locals yet. Add rows in Supabase or use mock data by leaving env
            vars unset.
          </p>
        </Card>
      ) : null}

      {status === "ready" ? (
        <div className="space-y-6">
          {rows.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {l.name}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {l.districtName} · Charter {l.charterNumber}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {l.memberCount.toLocaleString()} members
                </p>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bargaining units
                </h3>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {l.units.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-500 sm:col-span-2">
                      No bargaining units for this local yet.
                    </li>
                  ) : (
                    l.units.map((u) => (
                      <li
                        key={u.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
                      >
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {u.employerName}
                        </p>
                        <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                          {u.description}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

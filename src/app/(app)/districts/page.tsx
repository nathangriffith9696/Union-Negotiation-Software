"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { districts as mockDistricts, locals as mockLocals } from "@/data/mock";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type LocalVM = {
  id: string;
  name: string;
  memberCount: number;
};

type DistrictVM = {
  id: string;
  name: string;
  region: string;
  code: string;
};

type RowVM = {
  district: DistrictVM;
  locals: LocalVM[];
};

/** Embed shape from `select(..., locals (...))` — not inferred from `Database` without Relationships. */
type DistrictWithLocalsRow = {
  id: string;
  name: string;
  region: string;
  code: string;
  locals:
    | {
        id: string;
        name: string;
        charter_number: string;
        member_count: number;
      }[]
    | {
        id: string;
        name: string;
        charter_number: string;
        member_count: number;
      }
    | null;
};

function buildMockRows(): RowVM[] {
  return mockDistricts.map((d) => ({
    district: {
      id: d.id,
      name: d.name,
      region: d.region,
      code: d.code,
    },
    locals: mockLocals
      .filter((l) => l.districtId === d.id)
      .map((l) => ({
        id: l.id,
        name: l.name,
        memberCount: l.memberCount,
      })),
  }));
}

export default function DistrictsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<
    "loading" | "ready" | "empty" | "error"
  >(() => (supabaseOn ? "loading" : "ready"));
  const [rows, setRows] = useState<RowVM[]>(() =>
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
          .from("districts")
          .select(
            "id, name, region, code, locals (id, name, charter_number, member_count)"
          )
          .order("name");

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as DistrictWithLocalsRow[];
        const list = typed.map((row) => {
          const nested = row.locals;
          const localsList = Array.isArray(nested)
            ? nested
            : nested
              ? [nested]
              : [];

          return {
            district: {
              id: row.id,
              name: row.name,
              region: row.region,
              code: row.code,
            },
            locals: localsList
              .map((l) => ({
                id: l.id,
                name: l.name,
                memberCount: l.member_count,
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          };
        });

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
        title="Districts"
        description="Organizational districts and the locals chartered within each."
      />

      {status === "loading" ? (
        <Card>
          <p className="text-sm text-slate-600">Loading districts…</p>
        </Card>
      ) : null}

      {status === "error" && errorMessage ? (
        <Card className="border-red-200 bg-red-50/80">
          <p className="text-sm font-medium text-red-900">
            Could not load districts
          </p>
          <p className="mt-2 text-sm text-red-800/90">{errorMessage}</p>
        </Card>
      ) : null}

      {status === "empty" ? (
        <Card>
          <p className="text-sm text-slate-600">
            No districts yet. Add rows in Supabase or use mock data by leaving
            env vars unset.
          </p>
        </Card>
      ) : null}

      {status === "ready" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {rows.map(({ district: d, locals: inDistrict }) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {d.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{d.region}</p>
                </div>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">
                  {d.code}
                </span>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Locals in district
                </h3>
                <ul className="mt-3 space-y-2">
                  {inDistrict.length === 0 ? (
                    <li className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      No locals in this district yet.
                    </li>
                  ) : (
                    inDistrict.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-slate-800">
                          {l.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {l.memberCount.toLocaleString()} members
                        </span>
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

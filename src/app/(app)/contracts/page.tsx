"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type EntityListStatus,
  ListEmptyCard,
  ListErrorCard,
  ListLoadingCard,
} from "@/components/entity-list/EntityListStates";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";
import { labelsFromLocalRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type MasterRow = {
  id: string;
  local_id: string;
  version_number: number;
  created_at: string;
  file_name: string | null;
  locals: {
    name: string;
    districts: { name: string } | { name: string }[] | null;
  } | null;
};

function localLabel(row: MasterRow): string {
  const { localName, districtName } = labelsFromLocalRelation(row.locals);
  return `${localName} · ${districtName}`;
}

type LocalGroup = {
  localId: string;
  label: string;
  /** Newest first (highest version_number). */
  versions: MasterRow[];
};

function buildLocalGroups(rows: MasterRow[]): LocalGroup[] {
  const byLocal = new Map<string, MasterRow[]>();
  for (const row of rows) {
    const list = byLocal.get(row.local_id);
    if (list) list.push(row);
    else byLocal.set(row.local_id, [row]);
  }
  const groups: LocalGroup[] = [];
  for (const [localId, versions] of byLocal) {
    versions.sort((a, b) => b.version_number - a.version_number);
    const label = localLabel(versions[0]!);
    groups.push({ localId, label, versions });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return groups;
}

function filterGroups(groups: LocalGroup[], query: string): LocalGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter((g) => g.label.toLowerCase().includes(q));
}

export default function AgreementsLibraryPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("ready");
      setRows([]);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    void (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase
          .from("master_contracts")
          .select(
            `
            id,
            local_id,
            version_number,
            created_at,
            file_name,
            locals ( name, districts ( name ) )
          `
          )
          .order("local_id", { ascending: true })
          .order("version_number", { ascending: false });

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const list = (data ?? []) as MasterRow[];
        setRows(list);
        setStatus(list.length === 0 ? "empty" : "ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(
          e instanceof Error ? e.message : "Something went wrong"
        );
        setStatus("error");
        setRows([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const localGroups = useMemo(() => buildLocalGroups(rows), [rows]);
  const visibleGroups = useMemo(
    () => filterGroups(localGroups, localSearch),
    [localGroups, localSearch]
  );

  return (
    <>
      <PageHeader
        title="Agreements"
        description="Published master contracts by local. Each new upload becomes the current CBA; earlier uploads stay on file below as previous versions."
      />

      {!supabaseOn ? (
        <Card>
          <p className="text-sm text-slate-600">
            Connect Supabase to load agreements from your organization. This
            list is empty in demo mode.
          </p>
        </Card>
      ) : null}

      {supabaseOn && status === "loading" ? (
        <ListLoadingCard noun="agreements" />
      ) : null}

      {supabaseOn && status === "error" && errorMessage ? (
        <ListErrorCard noun="agreements" message={errorMessage} />
      ) : null}

      {supabaseOn && status === "empty" ? (
        <ListEmptyCard noun="published agreements" />
      ) : null}

      {supabaseOn && status === "ready" ? (
        <div className="space-y-6">
          <div className="max-w-xl">
            <label
              htmlFor="agreements-local-search"
              className="block text-sm font-medium text-slate-800"
            >
              Search locals
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Filter by local or district name. Clear the field to show all.
            </p>
            <input
              id="agreements-local-search"
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="e.g. district name, local number"
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
            />
          </div>

          {visibleGroups.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-600">
                No locals match this search. Try a different term.
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {visibleGroups.map((group) => (
                <Card key={group.localId} className="overflow-hidden p-0">
                  <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {group.label}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {group.versions.length} version
                      {group.versions.length === 1 ? "" : "s"} on file ·
                      Current is version {group.versions[0]!.version_number}
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {group.versions.map((row, i) => {
                      const isCurrent = i === 0;
                      return (
                        <li key={row.id}>
                          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-900">
                                <span>Version {row.version_number}</span>
                                {isCurrent ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                                    Current
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                    Previous
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {row.file_name ? `${row.file_name} · ` : null}
                                Uploaded {formatDate(row.created_at)}
                              </p>
                            </div>
                            <Link
                              href={`/contracts/${row.id}`}
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-center text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                            >
                              View agreement
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

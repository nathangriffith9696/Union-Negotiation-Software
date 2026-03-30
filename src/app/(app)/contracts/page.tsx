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
import { formatDate } from "@/lib/format";
import { labelsFromLocalRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type MasterRow = {
  id: string;
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

export default function AgreementsLibraryPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
            version_number,
            created_at,
            file_name,
            locals ( name, districts ( name ) )
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

  return (
    <>
      <PageHeader
        title="Agreements"
        description="Published master contracts on file by local. Read-only — negotiation drafts and proposals stay in the negotiation workspace."
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
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {localLabel(row)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Version {row.version_number}
                    {row.file_name ? ` · ${row.file_name}` : ""} · Uploaded{" "}
                    {formatDate(row.created_at)}
                  </p>
                </div>
                <Link
                  href={`/contracts/${row.id}`}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                >
                  View agreement
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

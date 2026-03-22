"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getBargainingUnitById,
  getDistrictById,
  getLocalById,
  getNegotiationById,
  sessionsMockForUi,
} from "@/data/mock";
import { formatDate, formatStatus } from "@/lib/format";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { SessionStatus } from "@/types/database";

type SessionCardVM = {
  id: string;
  title: string;
  sessionNumber: number;
  scheduledAt: string;
  status: SessionStatus;
  location: string | null;
  summary: string | null;
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
};

type SessionWithRelationsRow = {
  id: string;
  title: string;
  session_number: number;
  scheduled_at: string;
  status: SessionStatus;
  location: string | null;
  summary: string | null;
  next_session_date: string | null;
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

function buildMockRows(): SessionCardVM[] {
  return sessionsMockForUi.map((s) => {
    const neg = getNegotiationById(s.negotiationId);
    const bu = neg ? getBargainingUnitById(neg.bargainingUnitId) : undefined;
    const local = bu ? getLocalById(bu.localId) : undefined;
    const district = local ? getDistrictById(local.districtId) : undefined;

    return {
      id: s.id,
      title: s.title,
      sessionNumber: s.sessionNumber,
      scheduledAt: s.scheduledAt,
      status: s.status,
      location: s.location,
      summary: s.summary,
      negotiationTitle: neg?.title ?? "Unknown negotiation",
      bargainingUnitName: bu?.name ?? "Unknown unit",
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
    };
  });
}

function mapSupabaseRow(row: SessionWithRelationsRow): SessionCardVM {
  const neg = row.negotiations;
  const bu = neg?.bargaining_units;
  const loc = bu?.locals;

  return {
    id: row.id,
    title: row.title,
    sessionNumber: row.session_number,
    scheduledAt: row.scheduled_at,
    status: row.status,
    location: row.location,
    summary: row.summary,
    negotiationTitle: neg?.title ?? "Unknown negotiation",
    bargainingUnitName: bu?.name ?? "Unknown unit",
    localName: loc?.name ?? "Unknown local",
    districtName: loc ? districtNameFromEmbed(loc.districts) : "Unknown district",
  };
}

export default function SessionsPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<
    "loading" | "ready" | "empty" | "error"
  >(() => (supabaseOn ? "loading" : "ready"));
  const [rows, setRows] = useState<SessionCardVM[]>(() =>
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
          .from("sessions")
          .select(
            `
            id,
            title,
            session_number,
            scheduled_at,
            status,
            location,
            summary,
            next_session_date,
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
          .order("scheduled_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          setRows([]);
          return;
        }

        const typed = (data ?? []) as SessionWithRelationsRow[];
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
        title="Bargaining sessions"
        description="Scheduled and completed negotiation meetings."
      />

      {status === "loading" ? (
        <Card>
          <p className="text-sm text-slate-600">Loading sessions…</p>
        </Card>
      ) : null}

      {status === "error" && errorMessage ? (
        <Card className="border-red-200 bg-red-50/80">
          <p className="text-sm font-medium text-red-900">
            Could not load sessions
          </p>
          <p className="mt-2 text-sm text-red-800/90">{errorMessage}</p>
        </Card>
      ) : null}

      {status === "empty" ? (
        <Card>
          <p className="text-sm text-slate-600">
            No sessions yet. Add rows in Supabase or use mock data by leaving env
            vars unset.
          </p>
        </Card>
      ) : null}

      {status === "ready" ? (
        <div className="space-y-6">
          {rows.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {s.title}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {s.negotiationTitle}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {s.bargainingUnitName} · {s.localName} · {s.districtName}
                  </p>
                </div>
                <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {formatStatus(s.status)}
                </span>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Session number
                    </dt>
                    <dd className="mt-1 text-slate-700">{s.sessionNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Scheduled date
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatDate(s.scheduledAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Location
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {s.location?.trim() ? s.location : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatStatus(s.status)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Summary
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {s.summary?.trim() ? s.summary : "—"}
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

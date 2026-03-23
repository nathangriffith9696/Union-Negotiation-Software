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
  getBargainingUnitById,
  getDistrictById,
  getLocalById,
  getNegotiationById,
  notesMockForUi,
  proposals,
  sessions,
} from "@/data/mock";
import { formatDate, formatStatus } from "@/lib/format";
import {
  labelsFromNegotiationsRelation,
  optionalEmbedTitle,
} from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { NoteType, NoteVisibility } from "@/types/database";

type NoteCardVM = {
  id: string;
  body: string;
  author: string;
  noteType: NoteType;
  visibility: NoteVisibility;
  createdAt: string;
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
  sessionTitle: string | null;
  proposalTitle: string | null;
};

type NoteWithRelationsRow = {
  id: string;
  body: string;
  author: string;
  note_type: NoteType;
  visibility: NoteVisibility;
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
  sessions: { title: string } | { title: string }[] | null;
  proposals: { title: string } | { title: string }[] | null;
};

function buildMockRows(): NoteCardVM[] {
  return notesMockForUi.map((n) => {
    const neg = getNegotiationById(n.negotiationId);
    const bu = neg ? getBargainingUnitById(neg.bargainingUnitId) : undefined;
    const local = bu ? getLocalById(bu.localId) : undefined;
    const district = local ? getDistrictById(local.districtId) : undefined;

    const sessionTitle = n.sessionId
      ? sessions.find((s) => s.id === n.sessionId)?.title ?? null
      : null;
    const proposalTitle = n.proposalId
      ? proposals.find((p) => p.id === n.proposalId)?.title ?? null
      : null;

    return {
      id: n.id,
      body: n.body,
      author: n.author,
      noteType: n.noteType,
      visibility: n.visibility,
      createdAt: n.createdAt,
      negotiationTitle: neg?.title ?? "Unknown negotiation",
      bargainingUnitName: bu?.name ?? "Unknown unit",
      localName: local?.name ?? "Unknown local",
      districtName: district?.name ?? "Unknown district",
      sessionTitle,
      proposalTitle,
    };
  });
}

function mapSupabaseRow(row: NoteWithRelationsRow): NoteCardVM {
  const chain = labelsFromNegotiationsRelation(row.negotiations);
  return {
    id: row.id,
    body: row.body,
    author: row.author,
    noteType: row.note_type,
    visibility: row.visibility,
    createdAt: row.created_at,
    negotiationTitle: chain.negotiationTitle,
    bargainingUnitName: chain.bargainingUnitName,
    localName: chain.localName,
    districtName: chain.districtName,
    sessionTitle: optionalEmbedTitle(row.sessions),
    proposalTitle: optionalEmbedTitle(row.proposals),
  };
}

export default function NotesPage() {
  const supabaseOn = isSupabaseConfigured();
  const [status, setStatus] = useState<EntityListStatus>(() =>
    supabaseOn ? "loading" : "ready"
  );
  const [rows, setRows] = useState<NoteCardVM[]>(() =>
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
          .from("notes")
          .select(
            `
            id,
            body,
            author,
            note_type,
            visibility,
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
            ),
            sessions ( title ),
            proposals ( title )
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

        const typed = (data ?? []) as NoteWithRelationsRow[];
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
        title="Notes"
        description="Negotiation notes with optional session and proposal context."
      />

      {status === "loading" ? <ListLoadingCard noun="notes" /> : null}

      {status === "error" && errorMessage ? (
        <ListErrorCard noun="notes" message={errorMessage} />
      ) : null}

      {status === "empty" ? <ListEmptyCard noun="notes" /> : null}

      {status === "ready" ? (
        <div className="space-y-6">
          {rows.map((n) => (
            <Card key={n.id}>
              <p className="text-sm leading-relaxed text-slate-800">{n.body}</p>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Author
                    </dt>
                    <dd className="mt-1 text-slate-700">{n.author}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Note type
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatStatus(n.noteType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Visibility
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatStatus(n.visibility)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Negotiation
                    </dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {n.negotiationTitle}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Bargaining unit · Local · District
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {n.bargainingUnitName} · {n.localName} · {n.districtName}
                    </dd>
                  </div>
                  {n.sessionTitle ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Session
                      </dt>
                      <dd className="mt-1 text-slate-700">{n.sessionTitle}</dd>
                    </div>
                  ) : null}
                  {n.proposalTitle ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proposal
                      </dt>
                      <dd className="mt-1 text-slate-700">{n.proposalTitle}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Created date
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {formatDate(n.createdAt)}
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

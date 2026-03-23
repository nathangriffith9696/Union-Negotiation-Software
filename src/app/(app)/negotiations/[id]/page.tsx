"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ListErrorCard,
  ListLoadingCard,
} from "@/components/entity-list/EntityListStates";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  documentsMockForUi,
  getBargainingUnitById,
  getDistrictById,
  getLocalById,
  getNegotiationById,
  notesMockForUi,
  proposalsMockForUi,
  sessionsMockForUi,
} from "@/data/mock";
import { formatDate, formatOptionalDate, formatStatus } from "@/lib/format";
import { labelsFromNegotiationsRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type {
  DocumentType,
  NegotiationStatus,
  NoteType,
  ProposalStatus,
  SessionStatus,
} from "@/types/database";

type PageStatus = "loading" | "ready" | "not_found" | "error";

type NegotiationDetailVM = {
  id: string;
  title: string;
  status: NegotiationStatus;
  startedOn: string | null;
  targetContractEffectiveDate: string | null;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
};

type SessionItemVM = {
  id: string;
  title: string;
  sessionNumber: number;
  scheduledAt: string;
  status: SessionStatus;
  location: string | null;
};

type ProposalItemVM = {
  id: string;
  title: string;
  category: string;
  status: ProposalStatus;
};

type NoteItemVM = {
  id: string;
  body: string;
  author: string;
  noteType: NoteType;
  createdAt: string;
};

type DocumentItemVM = {
  id: string;
  fileName: string;
  documentType: DocumentType;
  uploadedAt: string;
};

type NegotiationDetailRow = {
  id: string;
  title: string;
  status: NegotiationStatus;
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

function mapNegotiationRow(row: NegotiationDetailRow): NegotiationDetailVM {
  const chain = labelsFromNegotiationsRelation({
    title: row.title,
    bargaining_units: row.bargaining_units,
  });
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startedOn: row.started_on,
    targetContractEffectiveDate: row.target_contract_effective_date,
    bargainingUnitName: chain.bargainingUnitName,
    localName: chain.localName,
    districtName: chain.districtName,
  };
}

function buildMockDetail(negotiationId: string): {
  negotiation: NegotiationDetailVM;
  sessions: SessionItemVM[];
  proposals: ProposalItemVM[];
  notes: NoteItemVM[];
  documents: DocumentItemVM[];
} | null {
  const n = getNegotiationById(negotiationId);
  if (!n) return null;

  const bu = getBargainingUnitById(n.bargainingUnitId);
  const local = bu ? getLocalById(bu.localId) : undefined;
  const district = local ? getDistrictById(local.districtId) : undefined;

  const negotiation: NegotiationDetailVM = {
    id: n.id,
    title: n.title,
    status: n.status,
    startedOn: n.startedOn,
    targetContractEffectiveDate: n.targetContractEffectiveDate,
    bargainingUnitName: bu?.name ?? "Unknown unit",
    localName: local?.name ?? "Unknown local",
    districtName: district?.name ?? "Unknown district",
  };

  const sessions = sessionsMockForUi
    .filter((s) => s.negotiationId === negotiationId)
    .map((s) => ({
      id: s.id,
      title: s.title,
      sessionNumber: s.sessionNumber,
      scheduledAt: s.scheduledAt,
      status: s.status,
      location: s.location,
    }))
    .sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
    );

  const proposals = proposalsMockForUi
    .filter((p) => p.negotiationId === negotiationId)
    .map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      status: p.status,
    }));

  const notes = notesMockForUi
    .filter((x) => x.negotiationId === negotiationId)
    .map((x) => ({
      id: x.id,
      body: x.body,
      author: x.author,
      noteType: x.noteType,
      createdAt: x.createdAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const documents = documentsMockForUi
    .filter((d) => d.negotiationId === negotiationId)
    .map((d) => ({
      id: d.id,
      fileName: d.fileName,
      documentType: d.documentType,
      uploadedAt: d.uploadedAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

  return { negotiation, sessions, proposals, notes, documents };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  );
}

function EmptySectionCard({ message }: { message: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-600">{message}</p>
    </Card>
  );
}

export default function NegotiationDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationDetailVM | null>(
    null
  );
  const [sessions, setSessions] = useState<SessionItemVM[]>([]);
  const [proposals, setProposals] = useState<ProposalItemVM[]>([]);
  const [notes, setNotes] = useState<NoteItemVM[]>([]);
  const [documents, setDocuments] = useState<DocumentItemVM[]>([]);

  useEffect(() => {
    if (!id) {
      setStatus("not_found");
      setNegotiation(null);
      return;
    }

    if (!isSupabaseConfigured()) {
      const mock = buildMockDetail(id);
      if (!mock) {
        setStatus("not_found");
        setNegotiation(null);
        return;
      }
      setNegotiation(mock.negotiation);
      setSessions(mock.sessions);
      setProposals(mock.proposals);
      setNotes(mock.notes);
      setDocuments(mock.documents);
      setErrorMessage(null);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    (async () => {
      try {
        const supabase = createSupabaseClient();

        const [
          negRes,
          sessRes,
          propRes,
          noteRes,
          docRes,
        ] = await Promise.all([
          supabase
            .from("negotiations")
            .select(
              `
              id,
              title,
              status,
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
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("sessions")
            .select(
              "id, title, session_number, scheduled_at, status, location"
            )
            .eq("negotiation_id", id)
            .order("scheduled_at", { ascending: false }),
          supabase
            .from("proposals")
            .select("id, title, category, status")
            .eq("negotiation_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("notes")
            .select("id, body, author, note_type, created_at")
            .eq("negotiation_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("documents")
            .select("id, file_name, document_type, uploaded_at")
            .eq("negotiation_id", id)
            .order("uploaded_at", { ascending: false }),
        ]);

        if (cancelled) return;

        const firstErr =
          negRes.error ||
          sessRes.error ||
          propRes.error ||
          noteRes.error ||
          docRes.error;
        if (firstErr) {
          setErrorMessage(firstErr.message);
          setStatus("error");
          setNegotiation(null);
          return;
        }

        if (!negRes.data) {
          setStatus("not_found");
          setNegotiation(null);
          return;
        }

        const negRow = negRes.data as NegotiationDetailRow;
        setNegotiation(mapNegotiationRow(negRow));

        type SessionRow = {
          id: string;
          title: string;
          session_number: number;
          scheduled_at: string;
          status: SessionStatus;
          location: string | null;
        };
        setSessions(
          ((sessRes.data ?? []) as SessionRow[]).map((row) => ({
            id: row.id,
            title: row.title,
            sessionNumber: row.session_number,
            scheduledAt: row.scheduled_at,
            status: row.status,
            location: row.location,
          }))
        );

        setProposals((propRes.data ?? []) as ProposalItemVM[]);

        type NoteRow = {
          id: string;
          body: string;
          author: string;
          note_type: NoteType;
          created_at: string;
        };
        setNotes(
          ((noteRes.data ?? []) as NoteRow[]).map((row) => ({
            id: row.id,
            body: row.body,
            author: row.author,
            noteType: row.note_type,
            createdAt: row.created_at,
          }))
        );

        type DocRow = {
          id: string;
          file_name: string;
          document_type: DocumentType;
          uploaded_at: string;
        };
        setDocuments(
          ((docRes.data ?? []) as DocRow[]).map((d) => ({
            id: d.id,
            fileName: d.file_name,
            documentType: d.document_type,
            uploadedAt: d.uploaded_at,
          }))
        );
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(
          e instanceof Error ? e.message : "Something went wrong"
        );
        setStatus("error");
        setNegotiation(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "loading") {
    return (
      <>
        <PageHeader title="Negotiation" description="Loading…" />
        <ListLoadingCard noun="negotiation" />
      </>
    );
  }

  if (status === "error" && errorMessage) {
    return (
      <>
        <PageHeader title="Negotiation" description="Could not load data." />
        <ListErrorCard noun="negotiation" message={errorMessage} />
      </>
    );
  }

  if (status === "not_found" || !negotiation) {
    return (
      <>
        <PageHeader title="Negotiation" description="Not found." />
        <Card>
          <p className="text-sm text-slate-600">
            No negotiation matches this link. Return to the list and pick a
            negotiation, or use mock IDs such as{" "}
            <span className="font-mono text-slate-800">neg-1</span> when Supabase
            is not configured.
          </p>
        </Card>
      </>
    );
  }

  const n = negotiation;

  return (
    <>
      <p className="mb-4 text-sm">
        <Link
          href="/negotiations"
          className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← All negotiations
        </Link>
      </p>
      <PageHeader
        title={n.title}
        description={`${n.bargainingUnitName} · ${n.localName} · ${n.districtName}`}
      />

      <Card className="mb-10">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </dt>
              <dd className="mt-1">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {formatStatus(n.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bargaining unit
              </dt>
              <dd className="mt-1 text-slate-700">{n.bargainingUnitName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Local
              </dt>
              <dd className="mt-1 text-slate-700">{n.localName}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                District
              </dt>
              <dd className="mt-1 text-slate-700">{n.districtName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Start date
              </dt>
              <dd className="mt-1 text-slate-700">
                {formatOptionalDate(n.startedOn) ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Target effective date
              </dt>
              <dd className="mt-1 text-slate-700">
                {formatOptionalDate(n.targetContractEffectiveDate) ?? "—"}
              </dd>
            </div>
        </dl>
      </Card>

      <section className="mb-10">
        <SectionTitle>Sessions</SectionTitle>
        {sessions.length === 0 ? (
          <EmptySectionCard message="No sessions for this negotiation yet." />
        ) : (
          <div className="space-y-4">
            {sessions.map((s) => (
              <Card key={s.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {s.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Session {s.sessionNumber}
                      {s.location?.trim() ? ` · ${s.location}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {formatStatus(s.status)}
                  </span>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  Scheduled {formatDate(s.scheduledAt)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>Proposals</SectionTitle>
        {proposals.length === 0 ? (
          <EmptySectionCard message="No proposals for this negotiation yet." />
        ) : (
          <div className="space-y-4">
            {proposals.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {p.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{p.category}</p>
                  </div>
                  <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {formatStatus(p.status)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>Notes</SectionTitle>
        {notes.length === 0 ? (
          <EmptySectionCard message="No notes for this negotiation yet." />
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <Card key={note.id}>
                <p className="text-sm leading-relaxed text-slate-800">
                  {note.body}
                </p>
                <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">
                    {note.author}
                  </span>
                  <span className="text-slate-400"> · </span>
                  {formatStatus(note.noteType)}
                  <span className="text-slate-400"> · </span>
                  {formatDate(note.createdAt)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>Documents</SectionTitle>
        {documents.length === 0 ? (
          <EmptySectionCard message="No documents for this negotiation yet." />
        ) : (
          <div className="space-y-4">
            {documents.map((d) => (
              <Card key={d.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {d.fileName}
                  </h3>
                  <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {formatStatus(d.documentType)}
                  </span>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  Uploaded {formatDate(d.uploadedAt)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

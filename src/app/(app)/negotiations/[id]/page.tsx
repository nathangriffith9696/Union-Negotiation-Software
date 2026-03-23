"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  SessionInsert,
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

const WORKSPACE_TABS = [
  { id: "summary", label: "Summary" },
  { id: "sessions", label: "Sessions" },
  { id: "proposals", label: "Proposals" },
  { id: "notes", label: "Notes" },
  { id: "documents", label: "Documents" },
] as const;

type WorkspaceTabId = (typeof WORKSPACE_TABS)[number]["id"];

const SESSION_STATUS_OPTIONS: SessionStatus[] = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "postponed",
];

type SessionQueryRow = {
  id: string;
  title: string;
  session_number: number;
  scheduled_at: string;
  status: SessionStatus;
  location: string | null;
};

function mapSessionQueryRows(rows: SessionQueryRow[]): SessionItemVM[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionNumber: row.session_number,
    scheduledAt: row.scheduled_at,
    status: row.status,
    location: row.location,
  }));
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
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("summary");

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionNumber, setNewSessionNumber] = useState(1);
  const [newSessionScheduledAt, setNewSessionScheduledAt] = useState("");
  const [newSessionLocation, setNewSessionLocation] = useState("");
  const [newSessionStatus, setNewSessionStatus] =
    useState<SessionStatus>("scheduled");
  const [newSessionSummary, setNewSessionSummary] = useState("");
  const [newSessionSaving, setNewSessionSaving] = useState(false);
  const [newSessionError, setNewSessionError] = useState<string | null>(null);
  const [sessionsRefreshError, setSessionsRefreshError] = useState<
    string | null
  >(null);

  const loadSessions = useCallback(async (): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured()) return { error: null };
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("id, title, session_number, scheduled_at, status, location")
      .eq("negotiation_id", id)
      .order("scheduled_at", { ascending: false });
    if (error) return { error: error.message };
    setSessions(mapSessionQueryRows((data ?? []) as SessionQueryRow[]));
    return { error: null };
  }, [id]);

  useEffect(() => {
    setActiveTab("summary");
  }, [id]);

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

        setSessions(
          mapSessionQueryRows((sessRes.data ?? []) as SessionQueryRow[])
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

  function openNewSessionModal() {
    const nextNum =
      sessions.reduce((max, s) => Math.max(max, s.sessionNumber), 0) + 1;
    setNewSessionNumber(nextNum);
    setNewSessionTitle("");
    setNewSessionScheduledAt("");
    setNewSessionLocation("");
    setNewSessionStatus("scheduled");
    setNewSessionSummary("");
    setNewSessionError(null);
    setSessionModalOpen(true);
  }

  async function handleCreateSession(e: FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;

    const title = newSessionTitle.trim();
    if (!title) {
      setNewSessionError("Title is required.");
      return;
    }
    if (!newSessionScheduledAt.trim()) {
      setNewSessionError("Scheduled date and time are required.");
      return;
    }
    const num = Number(newSessionNumber);
    if (!Number.isInteger(num) || num < 1) {
      setNewSessionError("Session number must be a positive whole number.");
      return;
    }

    let scheduledIso: string;
    try {
      scheduledIso = new Date(newSessionScheduledAt).toISOString();
    } catch {
      setNewSessionError("Invalid scheduled date.");
      return;
    }

    setNewSessionSaving(true);
    setNewSessionError(null);

    try {
      const supabase = createSupabaseClient();
      const row: SessionInsert = {
        negotiation_id: id,
        session_number: num,
        title,
        scheduled_at: scheduledIso,
        location: newSessionLocation.trim() || null,
        status: newSessionStatus,
        summary: newSessionSummary.trim() || null,
        format: "in_person",
        next_session_date: null,
        actual_start_at: null,
        actual_end_at: null,
      };
      const { error: insertError } = await supabase
        .from("sessions")
        // Database generic does not expose Insert for this table to PostgREST typings.
        .insert(row as never);

      if (insertError) {
        setNewSessionError(insertError.message);
        return;
      }

      const refresh = await loadSessions();
      if (refresh.error) {
        setSessionsRefreshError(refresh.error);
      } else {
        setSessionsRefreshError(null);
      }

      setSessionModalOpen(false);
    } catch (err) {
      setNewSessionError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setNewSessionSaving(false);
    }
  }

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

      <nav
        className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Negotiation workspace"
        role="tablist"
      >
        {WORKSPACE_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`negotiation-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`negotiation-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div
        role="tabpanel"
        id={`negotiation-panel-${activeTab}`}
        aria-labelledby={`negotiation-tab-${activeTab}`}
      >
        {activeTab === "summary" ? (
          <Card>
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
        ) : null}

        {activeTab === "sessions" ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {isSupabaseConfigured() ? (
                <button
                  type="button"
                  onClick={openNewSessionModal}
                  className="inline-flex w-fit items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  + New Session
                </button>
              ) : (
                <p className="text-sm text-slate-500">
                  Connect Supabase to add sessions from this workspace.
                </p>
              )}
            </div>

            {sessionsRefreshError ? (
              <Card className="mb-4 border-red-200 bg-red-50/80">
                <p className="text-sm font-medium text-red-900">
                  Session was created but the list could not be refreshed.
                </p>
                <p className="mt-2 text-sm text-red-800/90">
                  {sessionsRefreshError}
                </p>
              </Card>
            ) : null}

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
          </>
        ) : null}

        {activeTab === "proposals" ? (
          proposals.length === 0 ? (
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
          )
        ) : null}

        {activeTab === "notes" ? (
          notes.length === 0 ? (
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
          )
        ) : null}

        {activeTab === "documents" ? (
          documents.length === 0 ? (
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
          )
        ) : null}
      </div>

      {sessionModalOpen && isSupabaseConfigured() ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-session-dialog-title"
          onClick={() => {
            if (!newSessionSaving) setSessionModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="relative max-h-[90vh] overflow-y-auto shadow-lg">
            <h2
              id="new-session-dialog-title"
              className="text-lg font-semibold text-slate-900"
            >
              New session
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Add a session to this negotiation.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleCreateSession}>
              <div>
                <label
                  htmlFor="new-session-title"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Title
                </label>
                <input
                  id="new-session-title"
                  type="text"
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  autoComplete="off"
                />
              </div>

              <div>
                <label
                  htmlFor="new-session-number"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Session number
                </label>
                <input
                  id="new-session-number"
                  type="number"
                  min={1}
                  step={1}
                  value={newSessionNumber}
                  onChange={(e) =>
                    setNewSessionNumber(Number(e.target.value) || 1)
                  }
                  required
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                />
              </div>

              <div>
                <label
                  htmlFor="new-session-scheduled"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Scheduled (date and time)
                </label>
                <input
                  id="new-session-scheduled"
                  type="datetime-local"
                  value={newSessionScheduledAt}
                  onChange={(e) => setNewSessionScheduledAt(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                />
              </div>

              <div>
                <label
                  htmlFor="new-session-location"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Location
                </label>
                <input
                  id="new-session-location"
                  type="text"
                  value={newSessionLocation}
                  onChange={(e) => setNewSessionLocation(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  autoComplete="off"
                />
              </div>

              <div>
                <label
                  htmlFor="new-session-status"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Status
                </label>
                <select
                  id="new-session-status"
                  value={newSessionStatus}
                  onChange={(e) =>
                    setNewSessionStatus(e.target.value as SessionStatus)
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                >
                  {SESSION_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {formatStatus(st)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-session-summary"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Summary{" "}
                  <span className="font-normal normal-case text-slate-400">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="new-session-summary"
                  value={newSessionSummary}
                  onChange={(e) => setNewSessionSummary(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                />
              </div>

              {newSessionError ? (
                <div
                  className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-800"
                  role="alert"
                >
                  {newSessionError}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={newSessionSaving}
                  onClick={() => {
                    if (!newSessionSaving) setSessionModalOpen(false);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newSessionSaving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  {newSessionSaving ? "Saving…" : "Create session"}
                </button>
              </div>
            </form>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}

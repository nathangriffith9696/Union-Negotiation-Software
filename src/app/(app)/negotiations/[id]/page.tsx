"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ListErrorCard,
  ListLoadingCard,
} from "@/components/entity-list/EntityListStates";
import { Card } from "@/components/ui/Card";
import {
  NewProposalBodyEditor,
  type NewProposalBodyEditorHandle,
} from "@/components/proposals/NewProposalBodyEditor";
import { ProposalSaveTracePanel } from "@/components/debug/ProposalSaveTracePanel";
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
import { sortProposalsByBargainingOrderSnake } from "@/lib/proposal-article-sort";
import { labelsFromNegotiationsRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type {
  DocumentType,
  NegotiationStatus,
  NoteType,
  ProposalInsert,
  ProposalStatus,
  ProposingParty,
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
  summary: string | null;
};

type ProposalItemVM = {
  id: string;
  title: string;
  category: string;
  status: ProposalStatus;
  body_html: string | null;
  summary: string | null;
  created_at: string;
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
      summary: s.summary,
    }))
    .sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
    );

  const proposals = sortProposalsByBargainingOrderSnake(
    proposalsMockForUi
      .filter((p) => p.negotiationId === negotiationId)
      .map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        status: p.status,
        body_html: p.bodyHtml ?? null,
        summary: p.summary,
        created_at: p.createdAt,
      }))
  );

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

const PROPOSAL_STATUS_OPTIONS: ProposalStatus[] = [
  "draft",
  "submitted",
  "in_negotiation",
  "tentative",
  "withdrawn",
  "settled",
];

const PROPOSING_PARTY_OPTIONS: ProposingParty[] = [
  "union",
  "employer",
  "joint",
  "other",
];

type SessionQueryRow = {
  id: string;
  title: string;
  session_number: number;
  scheduled_at: string;
  status: SessionStatus;
  location: string | null;
  summary: string | null;
};

function mapSessionQueryRows(rows: SessionQueryRow[]): SessionItemVM[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionNumber: row.session_number,
    scheduledAt: row.scheduled_at,
    status: row.status,
    location: row.location,
    summary: row.summary,
  }));
}

function nextSessionNumberFromList(list: SessionItemVM[]): number {
  return list.reduce((max, s) => Math.max(max, s.sessionNumber), 0) + 1;
}

/** After insert, if the list was not refreshed, still suggest a number above the one just saved. */
function nextSessionNumberAfterCreate(
  refreshedRows: SessionItemVM[] | null,
  staleList: SessionItemVM[],
  insertedNumber: number
): number {
  if (refreshedRows) {
    return nextSessionNumberFromList(refreshedRows);
  }
  return (
    Math.max(
      staleList.reduce((m, s) => Math.max(m, s.sessionNumber), 0),
      insertedNumber
    ) + 1
  );
}

/** Maps DB / PostgREST errors to short, actionable copy for the form. */
function friendlySessionInsertError(
  err: { message: string; code?: string },
  sessionNumber: number
): string {
  const msg = err.message.toLowerCase();
  const code = err.code ?? "";

  if (
    code === "23505" ||
    (msg.includes("unique") &&
      (msg.includes("session_number") ||
        msg.includes("negotiation_session") ||
        msg.includes("sessions_negotiation")))
  ) {
    return `Session number ${sessionNumber} is already used for this negotiation. Enter a different session number (each number must be unique per negotiation).`;
  }

  if (msg.includes("foreign key") || msg.includes("negotiation_id")) {
    return "This negotiation could not be found. Go back to the list and open the negotiation again.";
  }

  return err.message.trim() || "Could not create the session. Please try again.";
}

/** Maps DB / PostgREST errors for proposal insert to short, actionable copy. */
function friendlyProposalInsertError(err: {
  message: string;
  code?: string;
}): string {
  const msg = err.message.toLowerCase();
  const code = err.code ?? "";

  if (code === "23505" || msg.includes("unique constraint")) {
    return "A proposal with these details may already exist, or a uniqueness rule blocked the save. Change the title or version and try again.";
  }

  if (
    msg.includes("proposals_status_check") ||
    (msg.includes("status") &&
      (msg.includes("check constraint") || msg.includes("violates check")))
  ) {
    return "Status must be one of: draft, submitted, in negotiation, tentative, withdrawn, or settled. Pick a value from the list.";
  }

  if (
    msg.includes("proposals_proposing_party_check") ||
    (msg.includes("proposing_party") && msg.includes("check"))
  ) {
    return "Proposing party must be union, employer, joint, or other. Pick a value from the list.";
  }

  if (
    msg.includes("proposals_version_number_positive") ||
    (msg.includes("version_number") && msg.includes("check"))
  ) {
    return "Version number must be a whole number of 1 or higher.";
  }

  if (
    msg.includes("value too long") ||
    msg.includes("character varying") ||
    msg.includes("string_data_right_truncation")
  ) {
    return "One of the text fields is too long. Category allows up to 120 characters; version label up to 32.";
  }

  if (msg.includes("foreign key") || msg.includes("negotiation_id")) {
    return "This negotiation could not be found. Go back to the list and open the negotiation again.";
  }

  return err.message.trim() || "Could not create the proposal. Please try again.";
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
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

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

  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [newProposalTitle, setNewProposalTitle] = useState("");
  const [newProposalCategory, setNewProposalCategory] = useState("");
  const [newProposalStatus, setNewProposalStatus] =
    useState<ProposalStatus>("draft");
  const [newProposalProposingParty, setNewProposalProposingParty] =
    useState<ProposingParty>("union");
  const [newProposalSubmittedAt, setNewProposalSubmittedAt] = useState("");
  const [newProposalVersionNumber, setNewProposalVersionNumber] = useState(1);
  const [newProposalVersionLabel, setNewProposalVersionLabel] = useState("");
  const [newProposalSummary, setNewProposalSummary] = useState("");
  const [newProposalSaving, setNewProposalSaving] = useState(false);
  const [newProposalError, setNewProposalError] = useState<string | null>(null);
  const newProposalBodyEditorRef = useRef<NewProposalBodyEditorHandle>(null);
  const [proposalsRefreshError, setProposalsRefreshError] = useState<
    string | null
  >(null);

  const loadSessions = useCallback(async (): Promise<{
    error: string | null;
    rows: SessionItemVM[] | null;
  }> => {
    if (!isSupabaseConfigured()) return { error: null, rows: null };
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, title, session_number, scheduled_at, status, location, summary"
      )
      .eq("negotiation_id", id)
      .order("scheduled_at", { ascending: false });
    if (error) return { error: error.message, rows: null };
    const mapped = mapSessionQueryRows((data ?? []) as SessionQueryRow[]);
    setSessions(mapped);
    return { error: null, rows: mapped };
  }, [id]);

  const loadProposals = useCallback(async (): Promise<{
    error: string | null;
    rows: ProposalItemVM[] | null;
  }> => {
    if (!isSupabaseConfigured()) return { error: null, rows: null };
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("proposals")
      .select("id, title, category, status, body_html, summary, created_at")
      .eq("negotiation_id", id);
    if (error) return { error: error.message, rows: null };
    const rows = sortProposalsByBargainingOrderSnake(
      (data ?? []) as ProposalItemVM[]
    );
    setProposals(rows);
    return { error: null, rows };
  }, [id]);

  useEffect(() => {
    const applyHashTab = () => {
      const h =
        typeof window !== "undefined"
          ? window.location.hash.replace(/^#/, "").toLowerCase()
          : "";
      if (h === "proposals") {
        setActiveTab("proposals");
        if (isSupabaseConfigured() && id) void loadProposals();
      } else {
        setActiveTab("summary");
      }
    };
    applyHashTab();
    window.addEventListener("hashchange", applyHashTab);
    return () => window.removeEventListener("hashchange", applyHashTab);
  }, [id, loadProposals]);

  useEffect(() => {
    if (!isSupabaseConfigured() || status !== "ready") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (activeTabRef.current !== "proposals") return;
      void loadProposals();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status, loadProposals]);

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
              "id, title, session_number, scheduled_at, status, location, summary"
            )
            .eq("negotiation_id", id)
            .order("scheduled_at", { ascending: false }),
          supabase
            .from("proposals")
            .select("id, title, category, status, body_html, summary, created_at")
            .eq("negotiation_id", id),
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

        setProposals(
          sortProposalsByBargainingOrderSnake(
            (propRes.data ?? []) as ProposalItemVM[]
          )
        );

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

  function resetNewSessionFormToNewEntry(nextNumber: number) {
    setNewSessionTitle("");
    setNewSessionScheduledAt("");
    setNewSessionLocation("");
    setNewSessionStatus("scheduled");
    setNewSessionSummary("");
    setNewSessionError(null);
    setNewSessionNumber(nextNumber);
  }

  function openNewSessionModal() {
    setSessionsRefreshError(null);
    resetNewSessionFormToNewEntry(nextSessionNumberFromList(sessions));
    setSessionModalOpen(true);
  }

  function closeSessionModal() {
    if (newSessionSaving) return;
    setSessionModalOpen(false);
    resetNewSessionFormToNewEntry(nextSessionNumberFromList(sessions));
  }

  async function handleCreateSession(e: FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;

    const title = newSessionTitle.trim();
    if (!title) {
      setNewSessionError("Enter a short title for this session (for example, “Economic package — opening”).");
      return;
    }
    if (!newSessionScheduledAt.trim()) {
      setNewSessionError("Choose when this session is scheduled using the date and time fields.");
      return;
    }
    const num = Number(newSessionNumber);
    if (!Number.isInteger(num) || num < 1) {
      setNewSessionError(
        "Session number must be a whole number of 1 or higher. Each negotiation uses its own sequence (1, 2, 3…)."
      );
      return;
    }

    const scheduledMs = new Date(newSessionScheduledAt).getTime();
    if (Number.isNaN(scheduledMs)) {
      setNewSessionError(
        "That date and time are not valid. Please pick a valid date and time."
      );
      return;
    }
    const scheduledIso = new Date(scheduledMs).toISOString();

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
        setNewSessionError(
          friendlySessionInsertError(insertError, num)
        );
        return;
      }

      const refresh = await loadSessions();
      if (refresh.error) {
        setSessionsRefreshError(
          `Your session was saved, but the list could not be refreshed. Try reloading the page. Details: ${refresh.error}`
        );
      } else {
        setSessionsRefreshError(null);
      }

      resetNewSessionFormToNewEntry(
        nextSessionNumberAfterCreate(refresh.rows, sessions, num)
      );
      setSessionModalOpen(false);
    } catch (err) {
      setNewSessionError(
        err instanceof Error
          ? err.message.trim() || "Something went wrong. Please try again."
          : "Something went wrong. Please try again."
      );
    } finally {
      setNewSessionSaving(false);
    }
  }

  function resetNewProposalForm() {
    setNewProposalTitle("");
    setNewProposalCategory("");
    setNewProposalStatus("draft");
    setNewProposalProposingParty("union");
    setNewProposalSubmittedAt("");
    setNewProposalVersionNumber(1);
    setNewProposalVersionLabel("");
    setNewProposalSummary("");
    setNewProposalError(null);
  }

  function openNewProposalModal() {
    setProposalsRefreshError(null);
    resetNewProposalForm();
    setProposalModalOpen(true);
  }

  function closeProposalModal() {
    if (newProposalSaving) return;
    setProposalModalOpen(false);
    resetNewProposalForm();
  }

  async function handleCreateProposal(e: FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;

    const title = newProposalTitle.trim();
    if (!title) {
      setNewProposalError(
        "Enter a title for this proposal (for example, “Wage scale — year 1”)."
      );
      return;
    }

    const category = newProposalCategory.trim();
    if (!category) {
      setNewProposalError(
        "Enter a category (for example, “economics”, “hours”, or “general”)."
      );
      return;
    }
    if (category.length > 120) {
      setNewProposalError("Category must be 120 characters or fewer.");
      return;
    }

    const versionNum = Number(newProposalVersionNumber);
    if (!Number.isInteger(versionNum) || versionNum < 1) {
      setNewProposalError(
        "Version number must be a whole number of 1 or higher."
      );
      return;
    }

    const versionLabel = newProposalVersionLabel.trim();
    if (versionLabel.length > 32) {
      setNewProposalError("Version label must be 32 characters or fewer.");
      return;
    }

    let submittedAtIso: string | null = null;
    if (newProposalSubmittedAt.trim()) {
      const submittedMs = new Date(newProposalSubmittedAt).getTime();
      if (Number.isNaN(submittedMs)) {
        setNewProposalError(
          "Submitted date and time are not valid. Pick a valid date and time or clear the field."
        );
        return;
      }
      submittedAtIso = new Date(submittedMs).toISOString();
    }

    setNewProposalSaving(true);
    setNewProposalError(null);

    try {
      const supabase = createSupabaseClient();
      const row: ProposalInsert = {
        negotiation_id: id,
        prior_proposal_id: null,
        title,
        category,
        status: newProposalStatus,
        proposing_party: newProposalProposingParty,
        submitted_at: submittedAtIso,
        version_number: versionNum,
        version_label: versionLabel || null,
        body_html: newProposalBodyEditorRef.current?.getHtmlForSave() ?? null,
        summary: newProposalSummary.trim() || null,
        submitted_by: null,
      };
      const { error: insertError } = await supabase
        .from("proposals")
        .insert(row as never);

      if (insertError) {
        setNewProposalError(friendlyProposalInsertError(insertError));
        return;
      }

      const refresh = await loadProposals();
      if (refresh.error) {
        setProposalsRefreshError(
          `Your proposal was saved, but the list could not be refreshed. Try reloading the page. Details: ${refresh.error}`
        );
      } else {
        setProposalsRefreshError(null);
      }

      resetNewProposalForm();
      setProposalModalOpen(false);
    } catch (err) {
      setNewProposalError(
        err instanceof Error
          ? err.message.trim() || "Something went wrong. Please try again."
          : "Something went wrong. Please try again."
      );
    } finally {
      setNewProposalSaving(false);
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
      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href="/negotiations"
          className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← All negotiations
        </Link>
        <span className="hidden text-slate-300 sm:inline" aria-hidden>
          |
        </span>
        <Link
          href={`/negotiations/${id}/contract`}
          className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          Contract editor
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
              onClick={() => {
                setActiveTab(tab.id);
                if (
                  tab.id === "proposals" &&
                  isSupabaseConfigured() &&
                  status === "ready"
                ) {
                  void loadProposals();
                }
              }}
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
                <p className="text-sm text-red-800/95">{sessionsRefreshError}</p>
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
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                      {s.summary?.trim() ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Summary
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                            {s.summary.trim()}
                          </p>
                        </div>
                      ) : null}
                      <p className="text-sm text-slate-600">
                        Scheduled {formatDate(s.scheduledAt)}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : null}

        {activeTab === "proposals" ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                {isSupabaseConfigured() ? (
                  <button
                    type="button"
                    onClick={openNewProposalModal}
                    className="inline-flex w-fit items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                  >
                    + New Proposal
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">
                    Connect Supabase to add proposals from this workspace.
                  </p>
                )}
                <Link
                  href={`/proposals?negotiation=${encodeURIComponent(id)}`}
                  className="w-fit text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                >
                  Print / export bargaining packet
                </Link>
              </div>
            </div>

            {proposalsRefreshError ? (
              <Card className="mb-4 border-red-200 bg-red-50/80">
                <p className="text-sm text-red-800/95">{proposalsRefreshError}</p>
              </Card>
            ) : null}

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
                        <p className="mt-1 text-sm text-slate-600">
                          {p.category}
                        </p>
                      </div>
                      <span className="shrink-0 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {formatStatus(p.status)}
                      </span>
                    </div>
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Proposal language
                        </p>
                        {p.body_html?.trim() ? (
                          <div
                            className="contract-editor-rich-preview mt-1.5 max-h-[min(36vh,14rem)] overflow-y-auto rounded-md border border-slate-100 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900"
                            dangerouslySetInnerHTML={{
                              __html: p.body_html.trim(),
                            }}
                          />
                        ) : (
                          <p className="mt-1.5 text-sm text-slate-500">—</p>
                        )}
                      </div>
                      {p.summary?.trim() ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Internal notes
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                            {p.summary.trim()}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
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
          onClick={() => closeSessionModal()}
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
                  onClick={() => closeSessionModal()}
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

      {proposalModalOpen && isSupabaseConfigured() ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-proposal-dialog-title"
          onClick={() => closeProposalModal()}
        >
          <div
            className="w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="relative max-h-[90vh] overflow-y-auto shadow-lg">
              <h2
                id="new-proposal-dialog-title"
                className="text-lg font-semibold text-slate-900"
              >
                New proposal
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Add a proposal to this negotiation.{" "}
                <span className="font-medium text-slate-700">
                  Proposal language
                </span>{" "}
                is what prints in the bargaining packet;{" "}
                <span className="font-medium text-slate-700">
                  internal notes
                </span>{" "}
                stay for your team only.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleCreateProposal}>
                <div>
                  <label
                    htmlFor="new-proposal-title"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Title
                  </label>
                  <input
                    id="new-proposal-title"
                    type="text"
                    value={newProposalTitle}
                    onChange={(e) => setNewProposalTitle(e.target.value)}
                    required
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-category"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Category
                  </label>
                  <input
                    id="new-proposal-category"
                    type="text"
                    value={newProposalCategory}
                    onChange={(e) => setNewProposalCategory(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="e.g. economics, hours, general"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-status"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Status
                  </label>
                  <select
                    id="new-proposal-status"
                    value={newProposalStatus}
                    onChange={(e) =>
                      setNewProposalStatus(e.target.value as ProposalStatus)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  >
                    {PROPOSAL_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {formatStatus(st)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-party"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Proposing party
                  </label>
                  <select
                    id="new-proposal-party"
                    value={newProposalProposingParty}
                    onChange={(e) =>
                      setNewProposalProposingParty(
                        e.target.value as ProposingParty
                      )
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  >
                    {PROPOSING_PARTY_OPTIONS.map((party) => (
                      <option key={party} value={party}>
                        {formatStatus(party)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-submitted"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Submitted (date and time){" "}
                    <span className="font-normal normal-case text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="new-proposal-submitted"
                    type="datetime-local"
                    value={newProposalSubmittedAt}
                    onChange={(e) => setNewProposalSubmittedAt(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-version-num"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Version number
                  </label>
                  <input
                    id="new-proposal-version-num"
                    type="number"
                    min={1}
                    step={1}
                    value={newProposalVersionNumber}
                    onChange={(e) =>
                      setNewProposalVersionNumber(Number(e.target.value) || 1)
                    }
                    required
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-version-label"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Version label{" "}
                    <span className="font-normal normal-case text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="new-proposal-version-label"
                    type="text"
                    value={newProposalVersionLabel}
                    onChange={(e) => setNewProposalVersionLabel(e.target.value)}
                    maxLength={32}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Proposal language{" "}
                    <span className="font-normal normal-case text-slate-400">
                      (optional — printable text)
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Formatted language for the bargaining table and PDF packet.
                    Leave blank for title-only entries.
                  </p>
                  <div className="mt-1.5">
                    <NewProposalBodyEditor ref={newProposalBodyEditorRef} />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="new-proposal-summary"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Internal notes{" "}
                    <span className="font-normal normal-case text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Caucus or tracking notes — not used as the main packet
                    body when proposal language is set.
                  </p>
                  <textarea
                    id="new-proposal-summary"
                    value={newProposalSummary}
                    onChange={(e) => setNewProposalSummary(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
                  />
                </div>

                {newProposalError ? (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-800"
                    role="alert"
                  >
                    {newProposalError}
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={newProposalSaving}
                    onClick={() => closeProposalModal()}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={newProposalSaving}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {newProposalSaving ? "Saving…" : "Create proposal"}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      ) : null}

      <ProposalSaveTracePanel
        rows={proposals.map((p) => ({
          id: p.id,
          bodyHtml: p.body_html,
          title: p.title,
        }))}
        listReady={status === "ready"}
      />
    </>
  );
}

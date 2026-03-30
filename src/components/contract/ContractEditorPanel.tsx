"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TipTapTablePopover } from "@/components/tiptap/TipTapTablePopover";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getNegotiationById } from "@/data/mock";
import {
  buildSectionDiffRows,
  sumChangeTotals,
  type SectionDiffRow,
  wrapDiffAdditionsInProposalBodyHtml,
} from "@/lib/contract-compare";
import {
  findNewestAligningDraftProposalId,
  markSectionRowsWhenProposalDraftDrifts,
  matchChangedRowsToSavedProposals,
  proposalSaveGroupKey,
  titlesAlignForProposal,
  type SavedProposalForReconcile,
} from "@/lib/proposal-candidate-reconcile";
import { formatDate } from "@/lib/format";
import { isLikelyNegotiationUuid } from "@/lib/negotiation-id";
import {
  isProposalSaveTraceCaptureEnabled,
  shouldCaptureProposalSaveTraceArticle1,
  writeProposalSaveTrace,
  type ProposalSaveTraceV1,
} from "@/lib/proposal-save-trace";
import { contractEditorTipTapExtensions } from "@/lib/tiptap-contract-editor-extensions";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type {
  NegotiationContractVersionInsert,
  ProposalInsert,
  ProposalUpdate,
} from "@/types/database";

const MOCK_STORAGE_PREFIX = "union-contract-versions:v1:";
const MOCK_DRAFT_PREFIX = "union-contract-draft:v1:";

type ContractVersionItem = {
  id: string;
  version_number: number;
  body_html: string;
  created_at: string;
};

type MockVersion = {
  version_number: number;
  body_html: string;
  created_at: string;
};

function mockStorageKey(negotiationId: string) {
  return `${MOCK_STORAGE_PREFIX}${negotiationId}`;
}

function readMockVersions(negotiationId: string): MockVersion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(mockStorageKey(negotiationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { versions?: MockVersion[] };
    return Array.isArray(parsed.versions) ? parsed.versions : [];
  } catch {
    return [];
  }
}

function mockVersionsToItems(versions: MockVersion[]): ContractVersionItem[] {
  return [...versions]
    .sort((a, b) => b.version_number - a.version_number)
    .map((v) => ({
      id: `local-${v.version_number}-${v.created_at}`,
      version_number: v.version_number,
      body_html: v.body_html,
      created_at: v.created_at,
    }));
}

function writeMockVersions(negotiationId: string, versions: MockVersion[]) {
  localStorage.setItem(
    mockStorageKey(negotiationId),
    JSON.stringify({ versions })
  );
}

function mockDraftKey(negotiationId: string) {
  return `${MOCK_DRAFT_PREFIX}${negotiationId}`;
}

function readMockDraft(negotiationId: string): {
  body_html: string;
  updated_at: string | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(mockDraftKey(negotiationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      body_html?: string;
      updated_at?: string | null;
    };
    if (typeof parsed.body_html !== "string") return null;
    return {
      body_html: parsed.body_html,
      updated_at:
        typeof parsed.updated_at === "string" ? parsed.updated_at : null,
    };
  } catch {
    return null;
  }
}

function writeMockDraft(
  negotiationId: string,
  bodyHtml: string,
  updatedAtIso: string
) {
  localStorage.setItem(
    mockDraftKey(negotiationId),
    JSON.stringify({ body_html: bodyHtml, updated_at: updatedAtIso })
  );
}

type HeadingOutlineItem = {
  index: number;
  level: number;
  text: string;
};

function extractHeadingsFromHtml(html: string): HeadingOutlineItem[] {
  if (typeof document === "undefined" || !html.trim()) return [];
  const d = document.createElement("div");
  d.innerHTML = html;
  const heads = d.querySelectorAll("h1, h2, h3");
  return Array.from(heads).map((el, index) => ({
    index,
    level: Number(el.tagName[1]),
    text: el.textContent?.trim() || `Section ${index + 1}`,
  }));
}

function extractHeadingsFromEditor(editor: Editor): HeadingOutlineItem[] {
  const root = editor.view.dom as HTMLElement;
  const heads = root.querySelectorAll("h1, h2, h3");
  return Array.from(heads).map((el, index) => ({
    index,
    level: Number(el.tagName[1]),
    text: el.textContent?.trim() || `Section ${index + 1}`,
  }));
}

function scrollToHeadingInRoot(root: HTMLElement | null, index: number) {
  if (!root) return;
  const heads = root.querySelectorAll("h1, h2, h3");
  const el = heads.item(index) as HTMLElement | null;
  el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Maps to HTML <ol type>; null = decimal (1, 2, 3). TipTap OrderedList already supports `type`. */
type ContractOrderedStyle = "decimal" | "alpha" | "roman";

function applyContractOrderedListStyle(
  editor: Editor,
  style: ContractOrderedStyle
) {
  const typeAttr: string | null =
    style === "decimal" ? null : style === "alpha" ? "a" : "i";

  if (editor.isActive("orderedList")) {
    editor.chain().focus().updateAttributes("orderedList", { type: typeAttr }).run();
    return;
  }

  const chain = editor.chain().focus();
  if (editor.isActive("bulletList")) {
    chain.toggleBulletList();
  }
  chain.toggleOrderedList().updateAttributes("orderedList", { type: typeAttr }).run();
}

function friendlyContractInsertError(err: {
  message: string;
  code?: string;
}): string {
  const msg = err.message.toLowerCase();
  const code = err.code ?? "";

  if (code === "23505" || msg.includes("unique constraint")) {
    return "A snapshot with this number already exists (for example, another tab saved first). Try “Create snapshot” again.";
  }

  if (msg.includes("foreign key") || msg.includes("negotiation_id")) {
    return "This negotiation could not be found. Return to the list and open it again.";
  }

  if (
    msg.includes("negotiation_contract_versions_version_positive") ||
    (msg.includes("version_number") && msg.includes("check"))
  ) {
    return "Version number must be 1 or higher.";
  }

  return (
    err.message.trim() ||
    "Could not save the contract snapshot. Please try again."
  );
}

function friendlyDraftUpsertError(err: {
  message: string;
  code?: string;
}): string {
  const msg = err.message.toLowerCase();
  const code = err.code ?? "";

  if (code === "23503" || msg.includes("foreign key")) {
    return "This negotiation could not be found, or your account cannot update the working draft.";
  }

  return (
    err.message.trim() ||
    "Could not save the working draft. Please try again."
  );
}

const PROPOSAL_CANDIDATE_SNIPPET_MAX = 200;

function proposalCandidateChangeType(
  row: SectionDiffRow
): "Added language" | "Removed language" | "Mixed changes" {
  const hasAdd = row.addedWords > 0;
  const hasRem = row.removedWords > 0;
  if (hasAdd && !hasRem) return "Added language";
  if (hasRem && !hasAdd) return "Removed language";
  return "Mixed changes";
}

function proposalCandidateSnippet(row: SectionDiffRow): string {
  let raw = "";
  for (const p of row.parts) {
    if (!p.added && !p.removed) continue;
    const v = p.value;
    if (!raw) {
      raw = v;
      continue;
    }
    const needsSpace =
      raw.length > 0 &&
      !/\s$/.test(raw) &&
      v.length > 0 &&
      !/^\s/.test(v);
    raw += (needsSpace ? " " : "") + v;
  }
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PROPOSAL_CANDIDATE_SNIPPET_MAX) return collapsed;
  return `${collapsed.slice(0, PROPOSAL_CANDIDATE_SNIPPET_MAX - 1).trimEnd()}…`;
}

function friendlyProposalSaveError(err: {
  message: string;
  code?: string;
}): string {
  const msg = err.message.toLowerCase();
  const code = err.code ?? "";

  if (code === "23503" || msg.includes("foreign key")) {
    return "The negotiation was not found in the database, or your account cannot write proposals for it.";
  }

  if (code === "23505" || msg.includes("unique constraint")) {
    return "A uniqueness rule blocked one of the proposals. Edit titles and try again.";
  }

  return err.message.trim() || "Could not save proposals. Please try again.";
}

function buildDefaultProposalReviewFields(
  row: SectionDiffRow,
  negotiationId: string
): {
  title: string;
  category: string;
  summary: string;
  negotiation_id: string;
} {
  const headingShort =
    row.headingLabel.length > 90
      ? `${row.headingLabel.slice(0, 87)}…`
      : row.headingLabel;
  return {
    title: headingShort,
    category: "general",
    summary: "",
    negotiation_id: negotiationId,
  };
}

type ProposalReviewItem = {
  /**
   * Last-seen section heading for this diff row index. Used to drop stale form
   * state when the same index maps to a different section after a re-diff.
   */
  sectionKey: string;
  include: boolean;
  title: string;
  category: string;
  summary: string;
};

/** Readable redline preview for proposal review (larger type, generous scroll area). */
function WorkspaceRedlinePreview({ row }: { row: SectionDiffRow }) {
  return (
    <div className="min-h-[14rem] max-h-[min(55vh,32rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 shadow-inner shadow-slate-900/[0.02]">
      {row.parts.map((part, i) => {
        if (part.added) {
          return (
            <mark
              key={`snip-${row.index}-a-${i}`}
              className="mx-0.5 inline rounded border border-emerald-400/90 bg-emerald-100 px-1 py-0.5 font-normal text-emerald-950 [text-decoration:none]"
            >
              {part.value}
            </mark>
          );
        }
        if (part.removed) {
          return (
            <span
              key={`snip-${row.index}-r-${i}`}
              className="mx-0.5 inline rounded border border-rose-300 bg-rose-50 px-1 py-0.5 text-rose-950 line-through decoration-rose-700 decoration-2"
            >
              {part.value}
            </span>
          );
        }
        return <span key={`snip-${row.index}-c-${i}`}>{part.value}</span>;
      })}
    </div>
  );
}

function ContractCompareView({
  negotiationId,
  baselineHtml,
  workingDraftHtml,
  baselineLabel,
  showProposalReview = true,
  compareContextLine,
  onAfterProposalsSaved,
}: {
  negotiationId: string;
  /** Older / baseline side of the diff (formal snapshot HTML). */
  baselineHtml: string;
  /** Newer side: live working draft HTML, or a later snapshot in history mode. */
  workingDraftHtml: string;
  baselineLabel: string;
  /** When false, show redline only (snapshot-to-snapshot history compare). */
  showProposalReview?: boolean;
  /** Shown under “Detected changes”, e.g. “Working draft vs Version 3”. */
  compareContextLine?: string;
  /**
   * After proposals persist successfully, sync `negotiation_contract_drafts` to the
   * current editor HTML so reopening the workspace does not load stale draft content.
   */
  onAfterProposalsSaved?: () => Promise<void>;
}) {
  const router = useRouter();

  const [savedProposalsForReconcile, setSavedProposalsForReconcile] = useState<
    SavedProposalForReconcile[]
  >([]);

  useEffect(() => {
    if (
      !showProposalReview ||
      !isSupabaseConfigured() ||
      !isLikelyNegotiationUuid(negotiationId)
    ) {
      setSavedProposalsForReconcile([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("proposals")
        .select("id, title, body_html, status, created_at")
        .eq("negotiation_id", negotiationId.trim())
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setSavedProposalsForReconcile([]);
        return;
      }
      setSavedProposalsForReconcile((data ?? []) as SavedProposalForReconcile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [negotiationId, showProposalReview]);

  const getCanonicalRowBody = useCallback((row: SectionDiffRow) => {
    const raw = row.newBodyHtml?.trim() ?? "";
    if (!raw) return "";
    if (typeof document === "undefined") return raw;
    return wrapDiffAdditionsInProposalBodyHtml(raw, row.parts);
  }, []);

  const rowsBase = useMemo(
    () => buildSectionDiffRows(baselineHtml, workingDraftHtml),
    [baselineHtml, workingDraftHtml]
  );

  const rows = useMemo(() => {
    if (!showProposalReview) return rowsBase;
    return markSectionRowsWhenProposalDraftDrifts(
      rowsBase,
      savedProposalsForReconcile,
      getCanonicalRowBody
    );
  }, [
    rowsBase,
    showProposalReview,
    savedProposalsForReconcile,
    getCanonicalRowBody,
  ]);

  const totals = useMemo(() => sumChangeTotals(rows), [rows]);
  const changedRows = useMemo(
    () => rows.filter((r) => r.hasChange),
    [rows]
  );

  const diffRowToSavedProposal = useMemo(
    () =>
      matchChangedRowsToSavedProposals(
        changedRows,
        savedProposalsForReconcile,
        getCanonicalRowBody
      ),
    [changedRows, savedProposalsForReconcile, getCanonicalRowBody]
  );

  const unmatchedProposalRows = useMemo(
    () => changedRows.filter((r) => !diffRowToSavedProposal.has(r.index)),
    [changedRows, diffRowToSavedProposal]
  );

  const matchedProposalRows = useMemo(
    () => changedRows.filter((r) => diffRowToSavedProposal.has(r.index)),
    [changedRows, diffRowToSavedProposal]
  );

  const [savedMatchesLaneOpen, setSavedMatchesLaneOpen] = useState(false);

  const reviewHeadingsKey = useMemo(
    () =>
      unmatchedProposalRows.map((r) => `${r.index}\u001f${r.headingLabel}`).join(
        "\u0002"
      ),
    [unmatchedProposalRows]
  );

  const [reviewItems, setReviewItems] = useState<
    Record<number, ProposalReviewItem>
  >({});

  useEffect(() => {
    setReviewItems((prev) => {
      const next: Record<number, ProposalReviewItem> = {};
      for (const r of unmatchedProposalRows) {
        const d = buildDefaultProposalReviewFields(r, negotiationId);
        const prevForIndex = prev[r.index];
        const prevMatch =
          prevForIndex && prevForIndex.sectionKey === r.headingLabel
            ? prevForIndex
            : undefined;
        next[r.index] = prevMatch
          ? { ...prevMatch, sectionKey: r.headingLabel }
          : {
              sectionKey: r.headingLabel,
              include: false,
              title: d.title,
              category: d.category,
              summary: d.summary,
            };
      }
      return next;
    });
    // Intentionally omit `unmatchedProposalRows`: same `reviewHeadingsKey` should not re-merge (avoids setState every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewHeadingsKey, negotiationId]);
  const [saveProposalsBusy, setSaveProposalsBusy] = useState(false);
  const [saveProposalsError, setSaveProposalsError] = useState<string | null>(
    null
  );

  const selectedCount = useMemo(
    () =>
      unmatchedProposalRows.filter((r) => reviewItems[r.index]?.include).length,
    [unmatchedProposalRows, reviewItems]
  );

  async function handleSaveSelectedProposals() {
    setSaveProposalsError(null);
    if (selectedCount === 0) {
      setSaveProposalsError("Select at least one change with “Include as proposal”.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setSaveProposalsError(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to save proposals."
      );
      return;
    }
    if (!isLikelyNegotiationUuid(negotiationId)) {
      setSaveProposalsError(
        "This editor is using a mock negotiation ID. Open a negotiation from your database to save proposals."
      );
      return;
    }

    setSaveProposalsBusy(true);
    const traceEnabled = isProposalSaveTraceCaptureEnabled();
    let article1Trace: ProposalSaveTraceV1 | null = null;
    let tracedInsertIndex: number | null = null;

    try {
      const supabase = createSupabaseClient();

      const { data: freshRows, error: freshErr } = await supabase
        .from("proposals")
        .select("id, title, body_html, status, created_at")
        .eq("negotiation_id", negotiationId.trim())
        .order("created_at", { ascending: false });

      if (freshErr) {
        setSaveProposalsError(friendlyProposalSaveError(freshErr));
        return;
      }
      const savedFresh = (freshRows ?? []) as SavedProposalForReconcile[];

      const insertPayload: ProposalInsert[] = [];
      const updatesById = new Map<string, ProposalUpdate>();

      const selectedRows = unmatchedProposalRows
        .filter((r) => reviewItems[r.index]?.include)
        .sort((a, b) => a.index - b.index);

      const byGroup = new Map<string, typeof selectedRows>();
      for (const r of selectedRows) {
        const k = proposalSaveGroupKey(r.headingLabel);
        const g = byGroup.get(k);
        if (g) g.push(r);
        else byGroup.set(k, [r]);
      }

      for (const rows of byGroup.values()) {
        rows.sort((a, b) => a.index - b.index);
        const primary = rows[0]!;

        const mergedRawNewBodyHtml = rows
          .map((r) => r.newBodyHtml?.trim() ?? "")
          .filter(Boolean)
          .join("");
        const mergedBodyHtml =
          rows
            .map((r) => {
              const raw = r.newBodyHtml?.trim();
              if (!raw) return "";
              return wrapDiffAdditionsInProposalBodyHtml(raw, r.parts);
            })
            .join("") || "";

        const it0 = reviewItems[primary.index]!;
        const defaults0 = buildDefaultProposalReviewFields(primary, negotiationId);
        const resolvedTitle = it0.title.trim() || defaults0.title;
        const titleForSave = titlesAlignForProposal(
          primary.headingLabel,
          resolvedTitle
        )
          ? resolvedTitle
          : defaults0.title;
        const title = titleForSave.trim() || "Contract change proposal";
        const category = it0.category.trim() || "general";
        const summaryParts = rows
          .map((r) => reviewItems[r.index]?.summary?.trim())
          .filter((s): s is string => Boolean(s));
        const summary = summaryParts.length ? summaryParts.join("\n\n") : null;
        const body_html = mergedBodyHtml || null;

        const draftId = findNewestAligningDraftProposalId(
          primary.headingLabel,
          savedFresh
        );
        if (draftId) {
          const patch = {
            title,
            category,
            summary,
            body_html,
          };
          if (
            traceEnabled &&
            rows.some((r) =>
              shouldCaptureProposalSaveTraceArticle1(r.headingLabel)
            )
          ) {
            const hadPriorArticle1Trace = article1Trace !== null;
            article1Trace = {
              v: 1,
              capturedAtIso: new Date().toISOString(),
              negotiationId: negotiationId.trim(),
              headingLabel: primary.headingLabel,
              rawNewBodyHtml: mergedRawNewBodyHtml,
              wrappedBodyHtml: body_html,
              matchedDraftProposalId: draftId,
              action: "UPDATE",
              supabasePayload: { ...patch },
              resolvedProposalId: draftId,
              postSaveFetch: null,
              proposalsListPhase: "pending",
              proposalsListBodyHtml: null,
              proposalsListRowFound: false,
            };
            if (hadPriorArticle1Trace) {
              article1Trace.overwrittenPriorTrace = true;
            }
          }
          updatesById.set(draftId, patch);
        } else {
          const insertObj: ProposalInsert = {
            negotiation_id: negotiationId.trim(),
            prior_proposal_id: null,
            title,
            category,
            status: "draft",
            summary,
            body_html,
            submitted_at: null,
            submitted_by: null,
            version_label: null,
            proposing_party: "union",
            version_number: 1,
          };
          if (
            traceEnabled &&
            rows.some((r) =>
              shouldCaptureProposalSaveTraceArticle1(r.headingLabel)
            )
          ) {
            const hadPriorArticle1Trace = article1Trace !== null;
            tracedInsertIndex = insertPayload.length;
            article1Trace = {
              v: 1,
              capturedAtIso: new Date().toISOString(),
              negotiationId: negotiationId.trim(),
              headingLabel: primary.headingLabel,
              rawNewBodyHtml: mergedRawNewBodyHtml,
              wrappedBodyHtml: body_html,
              matchedDraftProposalId: null,
              action: "INSERT",
              supabasePayload: { ...insertObj },
              resolvedProposalId: null,
              postSaveFetch: null,
              proposalsListPhase: "pending",
              proposalsListBodyHtml: null,
              proposalsListRowFound: false,
            };
            if (hadPriorArticle1Trace) {
              article1Trace.overwrittenPriorTrace = true;
            }
          }
          insertPayload.push(insertObj);
        }
      }

      if (insertPayload.length === 0 && updatesById.size === 0) {
        setSaveProposalsError("Select at least one change with “Include as proposal”.");
        return;
      }

      for (const [id, patch] of updatesById) {
        const { error: upErr } = await supabase
          .from("proposals")
          .update(patch as never)
          .eq("id", id);
        if (upErr) {
          setSaveProposalsError(friendlyProposalSaveError(upErr));
          return;
        }

        // PostgREST returns no error when RLS causes UPDATE to match 0 rows. Refetch and
        // compare body_html so silent failures (SELECT allowed, UPDATE blocked) are visible.
        if (Object.prototype.hasOwnProperty.call(patch, "body_html")) {
          const { data: persisted, error: persistErr } = await supabase
            .from("proposals")
            .select("body_html")
            .eq("id", id)
            .maybeSingle();
          if (persistErr) {
            setSaveProposalsError(friendlyProposalSaveError(persistErr));
            return;
          }
          const row = persisted as { body_html: string | null } | null;
          const expected = patch.body_html ?? null;
          const actual = row?.body_html ?? null;
          if (expected !== actual) {
            setSaveProposalsError(
              "Proposal language did not save: the database row’s body_html did not change after UPDATE. This usually means Row Level Security blocked the update (0 rows updated) while SELECT still returns the row. In Supabase, open public.proposals policies and ensure UPDATE’s USING/WITH CHECK align with what SELECT allows for your role."
            );
            return;
          }
        }
      }

      if (
        article1Trace?.action === "UPDATE" &&
        article1Trace.resolvedProposalId
      ) {
        const { data: reread, error: rereadErr } = await supabase
          .from("proposals")
          .select(
            "id, title, body_html, status, category, summary, created_at, negotiation_id"
          )
          .eq("id", article1Trace.resolvedProposalId)
          .single();
        article1Trace.postSaveFetch = {
          ok: !!reread && !rereadErr,
          error: rereadErr?.message ?? null,
          row: reread
            ? ({ ...(reread as Record<string, unknown>) })
            : null,
        };
      }

      if (insertPayload.length > 0) {
        if (article1Trace?.action === "INSERT") {
          const { data: insData, error: insErr } = await supabase
            .from("proposals")
            .insert(insertPayload as never)
            .select(
              "id, title, body_html, status, category, summary, created_at, negotiation_id"
            );
          if (insErr) {
            setSaveProposalsError(friendlyProposalSaveError(insErr));
            return;
          }
          const inserted = (insData ?? []) as {
            id: string;
            title: string;
            body_html: string | null;
            status: string;
            category: string;
            summary: string | null;
            created_at: string;
            negotiation_id: string;
          }[];
          const idx = tracedInsertIndex ?? 0;
          const row = inserted[idx];
          article1Trace.resolvedProposalId = row?.id ?? null;
          article1Trace.postSaveFetch = {
            ok: !!row,
            error: row
              ? null
              : `insert returned ${inserted.length} rows; expected row at index ${idx} (RLS on RETURNING?)`,
            row: row ? ({ ...(row as Record<string, unknown>) }) : null,
            insertSelectCount: inserted.length,
          };
        } else {
          const { error } = await supabase
            .from("proposals")
            .insert(insertPayload as never);

          if (error) {
            setSaveProposalsError(friendlyProposalSaveError(error));
            return;
          }
        }
      }

      if (article1Trace && traceEnabled) {
        writeProposalSaveTrace(article1Trace);
        console.groupCollapsed(
          "[Union] Article 1 proposal save trace",
          article1Trace.headingLabel
        );
        console.log(JSON.stringify(article1Trace, null, 2));
        console.groupEnd();
      }

      if (onAfterProposalsSaved) {
        try {
          await onAfterProposalsSaved();
        } catch (e) {
          setSaveProposalsError(
            e instanceof Error
              ? `Proposals saved, but the working draft could not be updated: ${e.message.trim() || "Save failed."}`
              : "Proposals saved, but the working draft could not be updated. Open the contract editor and use Save draft, then try again."
          );
          return;
        }
      }

      router.push(
        `/proposals?negotiation=${encodeURIComponent(negotiationId.trim())}`
      );
    } catch (e) {
      setSaveProposalsError(
        e instanceof Error
          ? e.message.trim() || "Save failed."
          : "Save failed."
      );
    } finally {
      setSaveProposalsBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Detected changes
        </p>
        {compareContextLine ? (
          <p className="mt-1 text-sm font-medium text-slate-800">
            {compareContextLine}
          </p>
        ) : null}
        {changedRows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {!baselineHtml.trim() && workingDraftHtml.trim() ? (
              <>
                No snapshot baseline yet. Use{" "}
                <span className="font-medium text-slate-800">
                  Create snapshot
                </span>{" "}
                once, then compare your working draft to that milestone.
              </>
            ) : (
              <>
                No textual changes vs {baselineLabel}.
              </>
            )}
          </p>
        ) : (
          <>
            <p className="mt-2 text-base text-slate-800">
              <span className="font-semibold text-slate-900">
                {totals.sectionsWithChanges}
              </span>{" "}
              {totals.sectionsWithChanges === 1 ? "section" : "sections"} with
              edits ·{" "}
              <span className="font-semibold text-emerald-800">
                +{totals.addedWords} words
              </span>
              {" · "}
              <span className="font-semibold text-rose-800">
                −{totals.removedWords} words
              </span>
              <span className="text-slate-500">
                {" "}
                (~{totals.addedChars} / ~{totals.removedChars} characters)
              </span>
            </p>
            <ul className="mt-4 grid max-h-none gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {changedRows.map((r) => (
                <li
                  key={r.index}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                >
                  <p className="font-medium leading-snug text-slate-900 line-clamp-2">
                    {r.headingLabel}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="font-medium text-emerald-800">
                      +{r.addedWords} words
                    </span>
                    {" · "}
                    <span className="font-medium text-rose-800">
                      −{r.removedWords} words
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {showProposalReview && changedRows.length > 0 ? (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Proposal review
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              New or edited contract language that does not yet match a saved
              proposal for this negotiation appears below. Defaults come from the
              redline; adjust title, category, and summary before saving. Edit or
              remove existing proposals on the negotiation’s proposals list.
            </p>
          </div>
          {saveProposalsError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-800">
              {saveProposalsError}
            </p>
          ) : null}
          {matchedProposalRows.length > 0 ? (
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setSavedMatchesLaneOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100/80"
                aria-expanded={savedMatchesLaneOpen}
              >
                <span>
                  Already saved
                  <span className="ml-2 font-normal text-slate-600">
                    ({matchedProposalRows.length}{" "}
                    {matchedProposalRows.length === 1 ? "section" : "sections"}{" "}
                    match proposals on file)
                  </span>
                </span>
                <span className="shrink-0 text-slate-500" aria-hidden>
                  {savedMatchesLaneOpen ? "▾" : "▸"}
                </span>
              </button>
              {savedMatchesLaneOpen ? (
                <ul className="space-y-2 border-t border-slate-200 px-4 py-3">
                  {matchedProposalRows.map((row) => {
                    return (
                      <li
                        key={`saved-match-${row.index}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className="mr-2 inline-block rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                            title="Matches a saved proposal for this negotiation"
                          >
                            Saved
                          </span>
                          <span className="font-medium text-slate-900">
                            {row.headingLabel}
                          </span>
                        </span>
                        <Link
                          href={`/negotiations/${encodeURIComponent(negotiationId.trim())}#proposals`}
                          className="shrink-0 text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                        >
                          Open proposals tab
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
          {unmatchedProposalRows.length === 0 &&
          matchedProposalRows.length > 0 ? (
            <p className="mb-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Every detected change matches a proposal already saved for this
              negotiation. Use “Already saved” above for context, or open the
              proposals tab to edit or remove.
            </p>
          ) : null}
          <ul className="space-y-6">
            {unmatchedProposalRows.map((row) => {
              const it = reviewItems[row.index];
              if (!it) return null;
              const changeType = proposalCandidateChangeType(row);
              const typePillClass =
                changeType === "Added language"
                  ? "border-emerald-300/90 bg-emerald-50 text-emerald-900"
                  : changeType === "Removed language"
                    ? "border-rose-300/90 bg-rose-50 text-rose-900"
                    : "border-slate-300 bg-slate-100 text-slate-800";
              return (
                <li
                  key={`proposal-review-${row.index}`}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
                    <div className="min-w-0 space-y-4">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={it.include}
                          onChange={(e) =>
                            setReviewItems((prev) => ({
                              ...prev,
                              [row.index]: {
                                ...prev[row.index]!,
                                include: e.target.checked,
                              },
                            }))
                          }
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        />
                        <span className="text-sm font-medium text-slate-800">
                          Include as proposal
                        </span>
                      </label>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Article / section
                        </p>
                        <p className="mt-1 text-base font-semibold leading-snug text-slate-900">
                          {row.headingLabel}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${typePillClass}`}
                        >
                          {changeType}
                        </span>
                        <span className="text-sm text-slate-600">
                          <span className="font-medium text-emerald-800">
                            +{row.addedWords}
                          </span>{" "}
                          words added ·{" "}
                          <span className="font-medium text-rose-800">
                            −{row.removedWords}
                          </span>{" "}
                          removed
                        </span>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Redline preview
                        </p>
                        <WorkspaceRedlinePreview row={row} />
                      </div>
                    </div>
                    <div className="min-w-0 space-y-4 border-t border-slate-100 pt-6 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0">
                      <div>
                        <label
                          htmlFor={`proposal-title-${row.index}`}
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Proposal title
                        </label>
                        <input
                          id={`proposal-title-${row.index}`}
                          type="text"
                          value={it.title}
                          onChange={(e) =>
                            setReviewItems((prev) => ({
                              ...prev,
                              [row.index]: {
                                ...prev[row.index]!,
                                title: e.target.value,
                              },
                            }))
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`proposal-category-${row.index}`}
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Category
                        </label>
                        <select
                          id={`proposal-category-${row.index}`}
                          value={it.category}
                          onChange={(e) =>
                            setReviewItems((prev) => ({
                              ...prev,
                              [row.index]: {
                                ...prev[row.index]!,
                                category: e.target.value,
                              },
                            }))
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                        >
                          <option value="general">general</option>
                          <option value="economics">economics</option>
                          <option value="benefits">benefits</option>
                          <option value="working_conditions">
                            working_conditions
                          </option>
                          <option value="grievance">grievance</option>
                          <option value="contract_administration">
                            contract_administration
                          </option>
                          <option value="other">other</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`proposal-summary-${row.index}`}
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Internal notes (optional)
                        </label>
                        <textarea
                          id={`proposal-summary-${row.index}`}
                          value={it.summary}
                          onChange={(e) =>
                            setReviewItems((prev) => ({
                              ...prev,
                              [row.index]: {
                                ...prev[row.index]!,
                                summary: e.target.value,
                              },
                            }))
                          }
                          rows={10}
                          className="mt-1.5 min-h-[12rem] w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        negotiation_id{" "}
                        <span className="font-mono text-slate-700">
                          {negotiationId}
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-8 rounded-xl border-2 border-slate-200 bg-slate-50 p-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                Save draft proposals
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {selectedCount > 0
                  ? `${selectedCount} selected — saved as drafts on the proposals list.`
                  : unmatchedProposalRows.length === 0
                    ? "No new proposal candidates in the checklist."
                    : "Select at least one change above."}
              </p>
            </div>
            <button
              type="button"
              disabled={
                saveProposalsBusy ||
                selectedCount === 0 ||
                !isSupabaseConfigured() ||
                !isLikelyNegotiationUuid(negotiationId)
              }
              onClick={() => void handleSaveSelectedProposals()}
              className="mt-3 w-full shrink-0 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto"
            >
              {saveProposalsBusy
                ? "Saving…"
                : `Save selected as proposals${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
            </button>
          </div>
          {!isSupabaseConfigured() ? (
            <p className="mt-3 text-sm text-slate-500">
              Connect Supabase to enable saving. After a successful save you are
              sent to the proposals list.
            </p>
          ) : !isLikelyNegotiationUuid(negotiationId) ? (
            <p className="mt-3 text-sm text-slate-500">
              Use a database-backed negotiation (UUID in the URL) to save
              proposals.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm leading-relaxed shadow-sm sm:p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Reference — full redline by section
        </p>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Complete diff for filing or counsel review (same content as above,
          uninterrupted).
        </p>
        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] leading-snug text-slate-500">
          <span>
            Sections are matched by heading text (including close renames and
            reordering), then diffed as plain text. Text inside &lt;s&gt;,
            &lt;strike&gt;, or &lt;del&gt; is omitted from that plain text so it
            appears as removed language here. Bold, italics, and strike styling
            still show fully in the editor and preview.
          </span>
        </p>
        <p className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border border-rose-300 bg-rose-100"
              aria-hidden
            />
            Removed (struck)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-400 bg-emerald-100"
              aria-hidden
            />
            Inserted language
          </span>
        </p>

        <div className="max-h-[min(70vh,44rem)] space-y-6 overflow-y-auto rounded-lg border border-slate-200/80 bg-white p-4 pr-2">
          {changedRows.length === 0 ? (
            <p className="text-slate-600">Nothing to show in the diff.</p>
          ) : (
            changedRows.map((row) => (
              <section
                key={row.index}
                className="border-b border-slate-100 pb-5 last:border-b-0 last:pb-0"
              >
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  {row.headingLabel}
                </h3>
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">
                  {row.parts.map((part, i) => {
                    if (part.added) {
                      return (
                        <mark
                          key={`${row.index}-a-${i}`}
                          className="mx-0.5 inline rounded border border-emerald-400/90 bg-emerald-100 px-1 py-0.5 font-normal text-emerald-950 shadow-sm [text-decoration:none]"
                        >
                          {part.value}
                        </mark>
                      );
                    }
                    if (part.removed) {
                      return (
                        <span
                          key={`${row.index}-r-${i}`}
                          className="mx-0.5 inline rounded border border-rose-300 bg-rose-50 px-1 py-0.5 text-rose-950 line-through decoration-rose-700 decoration-2"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    return <span key={`${row.index}-c-${i}`}>{part.value}</span>;
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] leading-snug text-slate-500">
        New-only sections list first in the new document order, then
        old-only sections as removed. Very different headings may not pair
        automatically; duplicate titles are matched in order within each
        version.
      </p>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const {
    hasTextSelection,
    bold,
    italic,
    strike,
    h2,
    bulletList,
    orderedDecimal,
    orderedAlpha,
    orderedRoman,
    blockquote,
    inTable,
  } = useEditorState({
    editor,
    selector: (snap) => {
      const ed = snap.editor;
      if (!ed) {
        return {
          hasTextSelection: false,
          bold: false,
          italic: false,
          strike: false,
          h2: false,
          bulletList: false,
          orderedDecimal: false,
          orderedAlpha: false,
          orderedRoman: false,
          blockquote: false,
          inTable: false,
        };
      }
      const olType = ed.getAttributes("orderedList").type as
        | string
        | null
        | undefined;
      const inOl = ed.isActive("orderedList");
      const isDecimal =
        inOl &&
        (olType == null ||
          olType === "" ||
          olType === "1" ||
          olType === "decimal");
      return {
        hasTextSelection: !ed.state.selection.empty,
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        strike: ed.isActive("strike"),
        h2: ed.isActive("heading", { level: 2 }),
        bulletList: ed.isActive("bulletList"),
        orderedDecimal: Boolean(isDecimal),
        orderedAlpha: inOl && olType === "a",
        orderedRoman: inOl && olType === "i",
        blockquote: ed.isActive("blockquote"),
        inTable: ed.isActive("table"),
      };
    },
  });

  const blockBtn =
    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors";
  const blockIdle =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const blockOn = "border-slate-300 bg-slate-200 text-slate-900";

  const inlineBtn =
    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-slate-50 disabled:shadow-none";
  const inlineIdle =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const inlineOn =
    "border-slate-300 bg-slate-200 text-slate-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400";

  const olSegBase =
    "min-w-[2.75rem] border-0 border-r border-slate-200 px-2.5 py-1.5 text-center text-xs font-semibold tabular-nums transition-colors last:border-r-0";
  const olSegIdle =
    "bg-white text-slate-800 hover:bg-slate-100 active:bg-slate-200/80";
  const olSegOn = "bg-slate-200 text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]";

  return (
    <div
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b border-slate-200 bg-slate-50/90 px-2 py-2"
      role="toolbar"
      aria-label="Contract formatting"
    >
      <button
        type="button"
        className={`${inlineBtn} ${bold ? inlineOn : inlineIdle}`}
        disabled={!hasTextSelection}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-pressed={bold}
        title={
          hasTextSelection
            ? "Bold"
            : "Bold — select text in the contract to enable"
        }
      >
        Bold
      </button>
      <button
        type="button"
        className={`${inlineBtn} ${italic ? inlineOn : inlineIdle}`}
        disabled={!hasTextSelection}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-pressed={italic}
        title={
          hasTextSelection
            ? "Italic"
            : "Italic — select text in the contract to enable"
        }
      >
        Italic
      </button>
      <button
        type="button"
        className={`${inlineBtn} ${strike ? inlineOn : inlineIdle}`}
        disabled={!hasTextSelection}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-pressed={strike}
        title={
          hasTextSelection
            ? "Strikethrough"
            : "Strikethrough — select text in the contract to enable"
        }
      >
        Strike
      </button>

      <div
        className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block"
        aria-hidden
      />

      <button
        type="button"
        className={`${blockBtn} ${h2 ? blockOn : blockIdle}`}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        aria-pressed={h2}
      >
        Heading
      </button>
      <button
        type="button"
        className={`${blockBtn} ${bulletList ? blockOn : blockIdle}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-pressed={bulletList}
      >
        Bullets
      </button>

      <div
        className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.04]"
        role="group"
        aria-label="Ordered list: 1-2-3, a-b-c, or roman i-ii-iii"
      >
        <button
          type="button"
          className={`${olSegBase} ${orderedDecimal ? olSegOn : olSegIdle}`}
          onClick={() => applyContractOrderedListStyle(editor, "decimal")}
          aria-pressed={orderedDecimal}
          aria-label="Numbered ordered list, 1 2 3"
          title="Numbered list (1, 2, 3)"
        >
          <span className="pointer-events-none font-mono text-[13px] leading-none tracking-tight">
            1.
          </span>
        </button>
        <button
          type="button"
          className={`${olSegBase} ${orderedAlpha ? olSegOn : olSegIdle}`}
          onClick={() => applyContractOrderedListStyle(editor, "alpha")}
          aria-pressed={orderedAlpha}
          aria-label="Lettered ordered list, a b c"
          title="Lettered list (a, b, c)"
        >
          <span className="pointer-events-none font-mono text-[13px] leading-none tracking-tight">
            a.
          </span>
        </button>
        <button
          type="button"
          className={`${olSegBase} ${orderedRoman ? olSegOn : olSegIdle}`}
          onClick={() => applyContractOrderedListStyle(editor, "roman")}
          aria-pressed={orderedRoman}
          aria-label="Roman ordered list, i ii iii"
          title="Roman list (i, ii, iii)"
        >
          <span className="pointer-events-none font-mono text-[13px] leading-none tracking-tight">
            i.
          </span>
        </button>
      </div>

      <button
        type="button"
        className={`${blockBtn} ${blockquote ? blockOn : blockIdle}`}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-pressed={blockquote}
      >
        Quote
      </button>
      <button
        type="button"
        className={`${blockBtn} ${blockIdle}`}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        Rule
      </button>

      <div
        className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block"
        aria-hidden
      />

      <TipTapTablePopover
        editor={editor}
        inTable={inTable}
        variant="contract"
      />
    </div>
  );
}

const MOCK_DEFAULT_HTML =
  "<p>Start drafting your contract here. Use the toolbar for headings, lists, and emphasis. Snapshots are stored in this browser only until you connect Supabase.</p>";

const SUPABASE_DEFAULT_HTML =
  "<p>Start drafting your collective agreement language here. Format with headings and lists as you would in a word processor. <span class=\"font-medium\">Save draft</span> keeps your working copy; <span class=\"font-medium\">Create snapshot</span> records a formal version for rollback and baseline compare.</p>";

function isUnseededDraft(html: string | null | undefined): boolean {
  if (html == null) return true;
  const t = html.trim();
  return t === "" || t === SUPABASE_DEFAULT_HTML.trim();
}

export function ContractEditorPanel({
  negotiationId,
}: {
  negotiationId: string;
}) {
  const [loadState, setLoadState] = useState<
    | { kind: "loading" }
    | { kind: "not_found" }
    | { kind: "error"; message: string }
    | {
        kind: "ready";
        title: string;
        html: string;
        draftUpdatedAt: string | null;
        latestVersionNumber: number | null;
        contentRevision: number;
        versions: ContractVersionItem[];
        /** Row in `master_contracts` used for restore-to-original; null if none on file yet. */
        masterContractId: string | null;
        masterContractVersion: number | null;
      }
  >({ kind: "loading" });

  /** `null` = preview the live working draft; a number = preview that snapshot. */
  const [previewSnapshotVersion, setPreviewSnapshotVersion] = useState<
    number | null
  >(null);
  /** Draft review = default proposal workflow (live draft vs baseline snapshot). */
  const [workspaceTab, setWorkspaceTab] = useState<
    "draftReview" | "preview" | "historyCompare"
  >("draftReview");
  /** `null` = use latest snapshot as draft-review baseline. */
  const [compareBaselineVersionNumber, setCompareBaselineVersionNumber] =
    useState<number | null>(null);
  /**
   * After "Restore to original", proposal review diffs against this HTML (the
   * master text) instead of a snapshot — avoids treating "back to master" as
   * massive deletions vs an old snapshot.
   */
  const [draftReviewBaselineOverrideHtml, setDraftReviewBaselineOverrideHtml] =
    useState<string | null>(null);
  /** Two snapshot picks for history compare; diff uses min/max version as old→new. */
  const [historyPickA, setHistoryPickA] = useState<number | null>(null);
  const [historyPickB, setHistoryPickB] = useState<number | null>(null);
  const [loadedIntoEditorVersion, setLoadedIntoEditorVersion] = useState<
    number | null
  >(null);

  const [draftSaving, setDraftSaving] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [liveEditorHtml, setLiveEditorHtml] = useState("");

  const lastAppliedRevision = useRef<number>(-1);
  const previewContentRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    setLoadState({ kind: "loading" });
    setSaveError(null);
    setSaveSuccess(null);
    setPreviewSnapshotVersion(null);
    setWorkspaceTab("draftReview");
    setCompareBaselineVersionNumber(null);
    setHistoryPickA(null);
    setHistoryPickB(null);
    setLoadedIntoEditorVersion(null);
    setDraftReviewBaselineOverrideHtml(null);
    lastAppliedRevision.current = -1;

    if (!negotiationId) {
      setLoadState({ kind: "not_found" });
      return;
    }

    if (!isSupabaseConfigured()) {
      const n = getNegotiationById(negotiationId);
      if (!n) {
        setLoadState({ kind: "not_found" });
        return;
      }
      const raw = readMockVersions(negotiationId);
      const versions = mockVersionsToItems(raw);
      const latest = versions[0] ?? null;
      const draftRow = readMockDraft(negotiationId);
      const html =
        (draftRow?.body_html?.trim()
          ? draftRow.body_html
          : latest?.body_html?.trim()) || MOCK_DEFAULT_HTML;
      const draftUpdatedAt = draftRow?.updated_at ?? null;
      setLoadState({
        kind: "ready",
        title: n.title,
        html,
        draftUpdatedAt,
        latestVersionNumber: latest?.version_number ?? null,
        contentRevision: Date.now(),
        versions,
        masterContractId: null,
        masterContractVersion: null,
      });
      return;
    }

    try {
      const supabase = createSupabaseClient();
      const [negRes, verRes, draftRes] = await Promise.all([
        supabase
          .from("negotiations")
          .select("title, master_contract_id, bargaining_units ( local_id )")
          .eq("id", negotiationId)
          .maybeSingle(),
        supabase
          .from("negotiation_contract_versions")
          .select("id, version_number, body_html, created_at")
          .eq("negotiation_id", negotiationId)
          .order("version_number", { ascending: false }),
        supabase
          .from("negotiation_contract_drafts")
          .select("body_html, updated_at")
          .eq("negotiation_id", negotiationId)
          .maybeSingle(),
      ]);

      if (negRes.error) {
        setLoadState({ kind: "error", message: negRes.error.message });
        return;
      }
      if (!negRes.data) {
        setLoadState({ kind: "not_found" });
        return;
      }

      if (verRes.error) {
        setLoadState({ kind: "error", message: verRes.error.message });
        return;
      }

      if (draftRes.error) {
        setLoadState({ kind: "error", message: draftRes.error.message });
        return;
      }

      const negRow = negRes.data as {
        title: string;
        master_contract_id: string | null;
        bargaining_units:
          | { local_id: string }
          | { local_id: string }[]
          | null;
      };
      const buRaw = negRow.bargaining_units;
      const buOne = Array.isArray(buRaw) ? buRaw[0] : buRaw;
      const localId = buOne?.local_id ?? null;

      let latestMaster: {
        id: string;
        body_html: string;
        version_number: number;
      } | null = null;
      if (localId) {
        const { data: mRow, error: mErr } = await supabase
          .from("master_contracts")
          .select("id, body_html, version_number")
          .eq("local_id", localId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (mErr) {
          setLoadState({ kind: "error", message: mErr.message });
          return;
        }
        if (mRow) {
          latestMaster = mRow as {
            id: string;
            body_html: string;
            version_number: number;
          };
        }
      }

      let effectiveMasterId = negRow.master_contract_id;
      if (!effectiveMasterId && latestMaster) {
        const { error: linkErr } = await supabase
          .from("negotiations")
          .update({ master_contract_id: latestMaster.id } as never)
          .eq("id", negotiationId)
          .is("master_contract_id", null);
        if (!linkErr) {
          effectiveMasterId = latestMaster.id;
        }
      }

      let masterContractVersion: number | null = null;
      if (effectiveMasterId) {
        if (latestMaster && latestMaster.id === effectiveMasterId) {
          masterContractVersion = latestMaster.version_number;
        } else {
          const { data: mvRow } = await supabase
            .from("master_contracts")
            .select("version_number")
            .eq("id", effectiveMasterId)
            .maybeSingle();
          masterContractVersion =
            (mvRow as { version_number: number } | null)?.version_number ?? null;
        }
      }

      const versions = (verRes.data ?? []) as ContractVersionItem[];
      const latest = versions[0] ?? null;
      const draftRow = draftRes.data as
        | { body_html: string; updated_at: string }
        | null;

      const draftHtml = draftRow?.body_html;
      const draftIsReal = !isUnseededDraft(draftHtml);

      let html: string;
      if (draftIsReal) {
        html = draftHtml!;
      } else if (latest?.body_html?.trim()) {
        html = latest.body_html;
      } else if (latestMaster?.body_html) {
        html = latestMaster.body_html;
      } else {
        html = SUPABASE_DEFAULT_HTML;
      }

      let draftUpdatedAt: string | null = draftRow?.updated_at ?? null;
      const draftNeedsPersist =
        !draftRow || (draftRow.body_html ?? "") !== html;
      if (draftNeedsPersist) {
        const nowIso = new Date().toISOString();
        const upsert = await supabase.from("negotiation_contract_drafts").upsert(
          {
            negotiation_id: negotiationId,
            body_html: html,
            updated_at: nowIso,
          } as never,
          { onConflict: "negotiation_id" }
        );
        if (upsert.error) {
          setLoadState({ kind: "error", message: upsert.error.message });
          return;
        }
        draftUpdatedAt = nowIso;
      }

      setLoadState({
        kind: "ready",
        title: negRow.title,
        html,
        draftUpdatedAt,
        latestVersionNumber: latest?.version_number ?? null,
        contentRevision: Date.now(),
        versions,
        masterContractId: effectiveMasterId,
        masterContractVersion,
      });
    } catch (e) {
      setLoadState({
        kind: "error",
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  }, [negotiationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const editor = useEditor({
    extensions: contractEditorTipTapExtensions,
    content: "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellCheck: "true",
      },
    },
  });

  useEffect(() => {
    if (!editor || loadState.kind !== "ready") return;
    if (loadState.contentRevision === lastAppliedRevision.current) return;
    editor.commands.setContent(loadState.html);
    lastAppliedRevision.current = loadState.contentRevision;
  }, [editor, loadState]);

  useEffect(() => {
    if (!editor || loadState.kind !== "ready") return;
    const sync = () => setLiveEditorHtml(editor.getHTML());
    sync();
    editor.on("update", sync);
    return () => {
      editor.off("update", sync);
    };
  }, [editor, loadState.kind]);

  const previewSnapshot =
    loadState.kind === "ready" && previewSnapshotVersion !== null
      ? loadState.versions.find(
          (v) => v.version_number === previewSnapshotVersion
        ) ?? null
      : null;

  const effectiveBaselineVersionNumber =
    loadState.kind === "ready"
      ? compareBaselineVersionNumber ??
        loadState.versions[0]?.version_number ??
        null
      : null;

  const baselineVersionRow =
    loadState.kind === "ready" && effectiveBaselineVersionNumber !== null
      ? loadState.versions.find(
          (v) => v.version_number === effectiveBaselineVersionNumber
        ) ?? loadState.versions[0] ?? null
      : null;

  const baselineHtml = baselineVersionRow?.body_html ?? "";
  const baselineLabel = baselineVersionRow
    ? `snapshot version ${baselineVersionRow.version_number}`
    : "your baseline (no snapshot saved yet)";

  /** Draft review only: after restore-to-master, align baseline with master so diffs are not vs an old snapshot. */
  const draftReviewBaselineHtml =
    draftReviewBaselineOverrideHtml !== null
      ? draftReviewBaselineOverrideHtml
      : baselineHtml;
  const draftReviewBaselineLabel =
    draftReviewBaselineOverrideHtml !== null
      ? "original master agreement"
      : baselineLabel;

  const defaultHistA =
    loadState.kind === "ready" && loadState.versions.length >= 2
      ? loadState.versions[1]!.version_number
      : null;
  const defaultHistB =
    loadState.kind === "ready" && loadState.versions.length >= 2
      ? loadState.versions[0]!.version_number
      : null;

  const effectiveHistA =
    loadState.kind === "ready" &&
    historyPickA != null &&
    loadState.versions.some((v) => v.version_number === historyPickA)
      ? historyPickA
      : defaultHistA;
  const effectiveHistB =
    loadState.kind === "ready" &&
    historyPickB != null &&
    loadState.versions.some((v) => v.version_number === historyPickB)
      ? historyPickB
      : defaultHistB;

  const histVLo =
    effectiveHistA != null && effectiveHistB != null
      ? Math.min(effectiveHistA, effectiveHistB)
      : null;
  const histVHi =
    effectiveHistA != null && effectiveHistB != null
      ? Math.max(effectiveHistA, effectiveHistB)
      : null;

  const historyOlderRow =
    loadState.kind === "ready" && histVLo != null
      ? loadState.versions.find((v) => v.version_number === histVLo) ?? null
      : null;
  const historyNewerRow =
    loadState.kind === "ready" && histVHi != null
      ? loadState.versions.find((v) => v.version_number === histVHi) ?? null
      : null;

  const outlineTargetsSnapshotPreview =
    workspaceTab === "preview" && previewSnapshotVersion !== null;

  const previewOutline = useMemo(() => {
    if (!outlineTargetsSnapshotPreview || !previewSnapshot) return [];
    return extractHeadingsFromHtml(previewSnapshot.body_html);
  }, [outlineTargetsSnapshotPreview, previewSnapshot]);

  const editorOutlineLive = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? extractHeadingsFromEditor(ed) : []),
  });

  const outlineItems: HeadingOutlineItem[] = outlineTargetsSnapshotPreview
    ? previewOutline
    : (editorOutlineLive ?? []);

  function handleOutlineNavigate(index: number) {
    if (outlineTargetsSnapshotPreview) {
      scrollToHeadingInRoot(previewContentRef.current, index);
      return;
    }
    if (editor) {
      scrollToHeadingInRoot(editor.view.dom as HTMLElement, index);
      editor.chain().focus().run();
    }
  }

  async function handleSaveDraft() {
    if (!editor || loadState.kind !== "ready") return;
    setSaveError(null);
    setSaveSuccess(null);

    if (editor.isEmpty) {
      setSaveError(
        "Add contract text before saving. The document cannot be empty."
      );
      return;
    }

    const bodyHtml = editor.getHTML();
    const nowIso = new Date().toISOString();

    setDraftSaving(true);
    try {
      if (!isSupabaseConfigured()) {
        writeMockDraft(negotiationId, bodyHtml, nowIso);
        setLoadState((prev) =>
          prev.kind === "ready"
            ? { ...prev, draftUpdatedAt: nowIso }
            : prev
        );
        setLoadedIntoEditorVersion(null);
        setSaveSuccess("Working draft saved (this browser only).");
        return;
      }

      const supabase = createSupabaseClient();
      const { error } = await supabase
        .from("negotiation_contract_drafts")
        .upsert(
          {
            negotiation_id: negotiationId,
            body_html: bodyHtml,
            updated_at: nowIso,
          } as never,
          { onConflict: "negotiation_id" }
        );

      if (error) {
        setSaveError(friendlyDraftUpsertError(error));
        return;
      }

      setLoadState((prev) =>
        prev.kind === "ready"
          ? { ...prev, draftUpdatedAt: nowIso }
          : prev
      );
      setLoadedIntoEditorVersion(null);
      setSaveSuccess(
        `Working draft saved · ${formatDate(nowIso)}`
      );
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message.trim() || "Save failed."
          : "Save failed."
      );
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleCreateSnapshot() {
    if (!editor || loadState.kind !== "ready") return;
    setSaveError(null);
    setSaveSuccess(null);

    if (editor.isEmpty) {
      setSaveError(
        "Add contract text before creating a snapshot. The document cannot be empty."
      );
      return;
    }

    const bodyHtml = editor.getHTML();

    setSnapshotSaving(true);
    try {
      const nextVersion = (loadState.latestVersionNumber ?? 0) + 1;

      if (!isSupabaseConfigured()) {
        const stored = readMockVersions(negotiationId);
        const nextMock: MockVersion = {
          version_number: nextVersion,
          body_html: bodyHtml,
          created_at: new Date().toISOString(),
        };
        writeMockVersions(negotiationId, [...stored, nextMock]);
        const versions = mockVersionsToItems([...stored, nextMock]);
        setDraftReviewBaselineOverrideHtml(null);
        setLoadState((prev) =>
          prev.kind === "ready"
            ? { ...prev, latestVersionNumber: nextVersion, versions }
            : prev
        );
        setLoadedIntoEditorVersion(null);
        setSaveSuccess(
          `Snapshot version ${nextVersion} created (stored locally in this browser).`
        );
        return;
      }

      const supabase = createSupabaseClient();
      const row: NegotiationContractVersionInsert = {
        negotiation_id: negotiationId,
        version_number: nextVersion,
        body_html: bodyHtml,
      };
      const { data: inserted, error } = await supabase
        .from("negotiation_contract_versions")
        .insert(row as never)
        .select("id, version_number, body_html, created_at")
        .single();

      if (error) {
        setSaveError(friendlyContractInsertError(error));
        return;
      }

      const newRow = inserted as ContractVersionItem;
      setDraftReviewBaselineOverrideHtml(null);
      setLoadState((prev) => {
        if (prev.kind !== "ready") return prev;
        return {
          ...prev,
          latestVersionNumber: newRow.version_number,
          versions: [newRow, ...prev.versions],
        };
      });
      setLoadedIntoEditorVersion(null);
      setSaveSuccess(
        `Snapshot version ${nextVersion} · ${formatDate(new Date().toISOString())}`
      );
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message.trim() || "Save failed."
          : "Save failed."
      );
    } finally {
      setSnapshotSaving(false);
    }
  }

  async function persistDraftFromHtml(bodyHtml: string) {
    const nowIso = new Date().toISOString();
    if (!isSupabaseConfigured()) {
      writeMockDraft(negotiationId, bodyHtml, nowIso);
      setLoadState((prev) =>
        prev.kind === "ready"
          ? { ...prev, draftUpdatedAt: nowIso, html: bodyHtml }
          : prev
      );
      return;
    }
    const supabase = createSupabaseClient();
    const { error } = await supabase.from("negotiation_contract_drafts").upsert(
      {
        negotiation_id: negotiationId,
        body_html: bodyHtml,
        updated_at: nowIso,
      } as never,
      { onConflict: "negotiation_id" }
    );
    if (error) throw new Error(friendlyDraftUpsertError(error));
    setLoadState((prev) =>
      prev.kind === "ready"
        ? { ...prev, draftUpdatedAt: nowIso, html: bodyHtml }
        : prev
    );
  }

  async function handleLoadVersionIntoEditor(version: ContractVersionItem) {
    if (!editor) return;
    setSaveError(null);
    setSaveSuccess(null);
    editor.commands.setContent(version.body_html);
    setLoadedIntoEditorVersion(version.version_number);
    try {
      await persistDraftFromHtml(version.body_html);
      setSaveSuccess(
        `Loaded snapshot ${version.version_number} into the editor; working draft updated.`
      );
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message.trim() || "Could not update working draft."
          : "Could not update working draft."
      );
    }
  }

  async function handleRestoreToOriginal() {
    if (!editor || loadState.kind !== "ready") return;
    setSaveError(null);
    setSaveSuccess(null);
    if (!loadState.masterContractId) {
      setSaveError(
        "No master agreement is on file for this local yet. Upload one in Admin."
      );
      return;
    }
    if (
      !window.confirm(
        "Replace the working draft with the original master agreement text? Your current draft text will be lost unless you saved a snapshot first."
      )
    ) {
      return;
    }
    setRestoreLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setSaveError(
          "Connect Supabase to restore from the published master agreement."
        );
        return;
      }
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("master_contracts")
        .select("body_html")
        .eq("id", loadState.masterContractId)
        .single();
      if (error || !data) {
        throw new Error(
          error?.message?.trim() || "Could not load the master agreement."
        );
      }
      const bodyHtml = (data as { body_html: string }).body_html;
      editor.commands.setContent(bodyHtml);
      setLoadedIntoEditorVersion(null);
      setDraftReviewBaselineOverrideHtml(bodyHtml);
      await persistDraftFromHtml(bodyHtml);
      setSaveSuccess(
        "Working draft restored to the original master agreement text. Proposal review now diffs from this baseline—not your previous snapshots."
      );
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message.trim() || "Restore failed."
          : "Restore failed."
      );
    } finally {
      setRestoreLoading(false);
    }
  }

  if (loadState.kind === "loading") {
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
        <PageHeader title="Contract editor" description="Loading…" />
        <Card>
          <p className="text-sm text-slate-600">Loading contract workspace…</p>
        </Card>
      </>
    );
  }

  if (loadState.kind === "not_found") {
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
        <PageHeader title="Contract editor" description="Not found." />
        <Card>
          <p className="text-sm text-slate-600">
            No negotiation matches this link. Return to the list or open a
            negotiation from the workspace.
          </p>
        </Card>
      </>
    );
  }

  if (loadState.kind === "error") {
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
        <PageHeader title="Contract editor" description="Could not load." />
        <Card>
          <p className="text-sm text-red-800">{loadState.message}</p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </Card>
      </>
    );
  }

  const { title, latestVersionNumber, versions, draftUpdatedAt } = loadState;

  return (
    <>
      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href="/negotiations"
          className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← All negotiations
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          href={`/negotiations/${negotiationId}`}
          className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← Negotiation workspace
        </Link>
      </p>

      <PageHeader title="Contract editor" description={title} />

      {!isSupabaseConfigured() ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/80">
          <p className="text-sm text-amber-950/90">
            Supabase is not configured. Working drafts and snapshots are stored
            only in this browser (local storage) for demo. Connect Supabase to
            persist them in the database.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
          <Card className="h-fit w-full shrink-0 lg:sticky lg:top-4 lg:max-h-[min(85vh,40rem)] lg:w-52 lg:overflow-hidden xl:w-56">
            <h2 className="text-sm font-semibold text-slate-900">
              Articles &amp; sections
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {outlineTargetsSnapshotPreview && previewSnapshot
                ? `Headings from version ${previewSnapshot.version_number} preview`
                : "Headings in your working draft"}
            </p>
            {outlineItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No headings yet. Use{" "}
                <span className="font-medium text-slate-800">Heading</span> in
                the toolbar for articles and sections.
              </p>
            ) : (
              <ul className="mt-3 max-h-60 space-y-0.5 overflow-y-auto border-t border-slate-100 pt-3 lg:max-h-[min(70vh,32rem)]">
                {outlineItems.map((h) => (
                  <li key={`${outlineTargetsSnapshotPreview ? "p" : "e"}-${h.index}`}>
                    <button
                      type="button"
                      onClick={() => handleOutlineNavigate(h.index)}
                      title={h.text}
                      style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }}
                      className="w-full rounded-md py-1.5 pr-1 text-left text-xs leading-snug text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      <span className="line-clamp-3">{h.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="min-w-0 flex-1 space-y-4">
            <Card className="p-0">
            <div className="border-b border-slate-100 px-4 py-3 sm:flex sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  Working draft
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {draftUpdatedAt
                    ? `Draft last saved ${formatDate(draftUpdatedAt)}.`
                    : "Draft not saved to storage yet."}{" "}
                  {latestVersionNumber !== null
                    ? `Latest snapshot: v${latestVersionNumber}.`
                    : "No snapshots yet — create one when you reach a checkpoint."}
                  {loadState.masterContractId ? (
                    loadState.masterContractVersion !== null ? (
                      <>
                        {" "}
                        Original master on file: v
                        {loadState.masterContractVersion}.
                      </>
                    ) : (
                      <> Original master linked.</>
                    )
                  ) : isSupabaseConfigured() ? (
                    <>
                      {" "}
                      No master agreement linked yet — upload in Admin.
                    </>
                  ) : null}
                </p>
                {loadedIntoEditorVersion !== null ? (
                  <p className="mt-1.5 text-xs text-slate-600">
                    Started from snapshot {loadedIntoEditorVersion}. Your edits
                    live in the working draft until you save it or create a new
                    snapshot.
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex w-full shrink-0 flex-col gap-2 sm:mt-0 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  disabled={draftSaving || !editor}
                  onClick={() => void handleSaveDraft()}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  {draftSaving ? "Saving draft…" : "Save draft"}
                </button>
                <button
                  type="button"
                  disabled={snapshotSaving || !editor}
                  onClick={() => void handleCreateSnapshot()}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                >
                  {snapshotSaving ? "Creating…" : "Create snapshot"}
                </button>
                <button
                  type="button"
                  disabled={
                    restoreLoading ||
                    !editor ||
                    !loadState.masterContractId
                  }
                  title={
                    loadState.masterContractId
                      ? "Restore working draft to the published master agreement text"
                      : "No master agreement linked for this negotiation yet"
                  }
                  onClick={() => void handleRestoreToOriginal()}
                  className="w-full rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-2 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {restoreLoading ? "Restoring…" : "Restore to original"}
                </button>
              </div>
            </div>

            {saveSuccess ? (
              <div className="border-b border-emerald-100 bg-emerald-50/80 px-4 py-2 text-sm text-emerald-900">
                {saveSuccess}
              </div>
            ) : null}
            {saveError ? (
              <div className="border-b border-red-100 bg-red-50/80 px-4 py-2 text-sm text-red-800">
                {saveError}
              </div>
            ) : null}

            <div className="negotiation-contract-editor border-t border-slate-100">
              {editor ? <Toolbar editor={editor} /> : null}
              <EditorContent editor={editor} />
            </div>
            </Card>
          </div>
        </div>

        <div className="w-full shrink-0 space-y-4 xl:w-80">
          <Card>
            <h2 className="text-sm font-semibold text-slate-900">
              Snapshot milestones
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Checkpoints for rollback and baselines. Proposal review uses your
              live working draft against one of these snapshots.
            </p>
            {versions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No snapshots yet. Use <span className="font-medium">Create snapshot</span>{" "}
                when you reach a milestone.
              </p>
            ) : (
              <ul className="mt-4 max-h-[min(46vh,20rem)] space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
                {versions.map((v) => {
                  const previewing =
                    workspaceTab === "preview" &&
                    previewSnapshotVersion === v.version_number;
                  return (
                    <li
                      key={v.id}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          Version {v.version_number}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(v.created_at)}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewSnapshotVersion(v.version_number);
                            setWorkspaceTab("preview");
                          }}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            previewing
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          disabled={!editor}
                          onClick={() => void handleLoadVersionIntoEditor(v)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Load into editor
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900">
              Review workspace
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Draft review is the default: proposals from current edits vs a
              baseline snapshot. Use history compare for two saved versions
              only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
              <button
                type="button"
                onClick={() => setWorkspaceTab("draftReview")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  workspaceTab === "draftReview"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Draft review
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab("preview")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  workspaceTab === "preview"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab("historyCompare")}
                disabled={versions.length < 2}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  workspaceTab === "historyCompare"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                History compare
              </button>
            </div>

            {workspaceTab === "draftReview" ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-relaxed text-slate-600">
                  The panel below compares the{" "}
                  <span className="font-medium text-slate-800">
                    working draft
                  </span>{" "}
                  (editor, including unsaved text) to the baseline you choose.
                  Select proposal candidates there—no need to open older
                  versions first.
                </p>
                {versions.length > 1 ? (
                  <div>
                    <label
                      htmlFor="compare-baseline-select"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Baseline snapshot
                    </label>
                    <select
                      id="compare-baseline-select"
                      value={
                        compareBaselineVersionNumber ??
                        versions[0]!.version_number
                      }
                      onChange={(e) => {
                        setDraftReviewBaselineOverrideHtml(null);
                        const n = Number(e.target.value);
                        const latestNum = versions[0]!.version_number;
                        setCompareBaselineVersionNumber(
                          n === latestNum ? null : n
                        );
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.version_number}>
                          Version {v.version_number}
                          {v.version_number === versions[0]!.version_number
                            ? " (latest — default baseline)"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : versions.length === 1 ? (
                  <p className="text-xs text-slate-500">
                    Baseline: version {versions[0]!.version_number}. When you add
                    more snapshots, you can pick which one to draft against.
                  </p>
                ) : (
                  <p className="text-xs text-amber-900/90">
                    Create a snapshot first. Then draft review can compare your
                    working copy to that milestone.
                  </p>
                )}
              </div>
            ) : workspaceTab === "preview" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSnapshotVersion(null);
                    setWorkspaceTab("preview");
                  }}
                  className={`mt-3 w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    previewSnapshotVersion === null
                      ? "border-slate-900 bg-slate-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80"
                  }`}
                >
                  Working draft (live)
                </button>
                {previewSnapshotVersion === null ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Mirror of the editor, including changes you have not saved as
                    a draft yet.
                  </p>
                ) : previewSnapshot ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Snapshot version {previewSnapshot.version_number} ·{" "}
                    {formatDate(previewSnapshot.created_at)}
                  </p>
                ) : null}

                {previewSnapshotVersion === null ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Read-only preview
                    </p>
                    <div
                      ref={previewContentRef}
                      className="contract-editor-rich-preview max-h-[min(60vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-4 text-sm leading-relaxed text-slate-800 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-2"
                      dangerouslySetInnerHTML={{
                        __html:
                          liveEditorHtml.trim() ||
                          "<p class=\"text-slate-500\">Start typing in the editor.</p>",
                      }}
                    />
                  </div>
                ) : previewSnapshot ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Read-only preview
                    </p>
                    <div
                      ref={previewContentRef}
                      className="contract-editor-rich-preview max-h-[min(60vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-4 text-sm leading-relaxed text-slate-800 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-2"
                      dangerouslySetInnerHTML={{
                        __html: previewSnapshot.body_html,
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-relaxed text-slate-600">
                  Redline between two saved snapshots (working draft is not
                  included). Use for audit or rollback review. For proposals from
                  current edits, switch to{" "}
                  <span className="font-medium text-slate-800">Draft review</span>
                  .
                </p>
                {versions.length >= 2 ? (
                  <>
                    <div>
                      <label
                        htmlFor="history-compare-a"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Snapshot A
                      </label>
                      <select
                        id="history-compare-a"
                        value={effectiveHistA ?? versions[0]!.version_number}
                        onChange={(e) =>
                          setHistoryPickA(Number(e.target.value))
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                      >
                        {versions.map((v) => (
                          <option key={`ha-${v.id}`} value={v.version_number}>
                            Version {v.version_number}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="history-compare-b"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Snapshot B
                      </label>
                      <select
                        id="history-compare-b"
                        value={effectiveHistB ?? versions[0]!.version_number}
                        onChange={(e) =>
                          setHistoryPickB(Number(e.target.value))
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                      >
                        {versions.map((v) => (
                          <option key={`hb-${v.id}`} value={v.version_number}>
                            Version {v.version_number}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-slate-500">
                      Diff direction: earlier version number → later (green =
                      added in the later snapshot).
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-900/90">
                    Add a second snapshot to compare two milestones.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {loadState.kind === "ready" && workspaceTab === "draftReview" ? (
        <div className="mt-10 w-full min-w-0">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-slate-100/90 px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                Draft review &amp; proposals
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {draftReviewBaselineOverrideHtml !== null ? (
                  <>
                    <span className="font-semibold text-slate-800">
                      Working draft
                    </span>{" "}
                    vs{" "}
                    <span className="font-semibold text-slate-800">
                      original master agreement
                    </span>{" "}
                    (baseline after restore). New edits are tracked from this
                    baseline; choose a snapshot baseline in the sidebar to
                    switch back.
                  </>
                ) : baselineVersionRow ? (
                  <>
                    <span className="font-semibold text-slate-800">
                      Working draft
                    </span>{" "}
                    vs{" "}
                    <span className="font-semibold text-slate-800">
                      Version {baselineVersionRow.version_number}
                    </span>{" "}
                    (baseline). The editor is the source of truth for the left
                    side of the redline; adjust the baseline in the sidebar if
                    needed.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-800">
                      Working draft
                    </span>{" "}
                    is ready; create a{" "}
                    <span className="font-semibold text-slate-800">
                      snapshot
                    </span>{" "}
                    so proposal review has a baseline to diff against.
                  </>
                )}
              </p>
            </div>
            <div className="p-4 sm:p-6 lg:p-8">
              <ContractCompareView
                key={`${negotiationId}-${draftReviewBaselineOverrideHtml ? "master-bl" : baselineVersionRow?.id ?? "none"}-${compareBaselineVersionNumber ?? "latest"}-draft`}
                negotiationId={negotiationId}
                baselineHtml={draftReviewBaselineHtml}
                workingDraftHtml={liveEditorHtml}
                baselineLabel={draftReviewBaselineLabel}
                showProposalReview
                compareContextLine={
                  draftReviewBaselineOverrideHtml !== null
                    ? "Working draft vs original master (restored baseline)"
                    : baselineVersionRow
                      ? `Working draft vs Version ${baselineVersionRow.version_number}`
                      : "Working draft — add a snapshot to set a proposal baseline"
                }
                onAfterProposalsSaved={async () => {
                  if (!editor || editor.isEmpty) return;
                  await persistDraftFromHtml(editor.getHTML());
                  setLoadedIntoEditorVersion(null);
                }}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {loadState.kind === "ready" && workspaceTab === "historyCompare" ? (
        <div className="mt-10 w-full min-w-0">
          {versions.length >= 2 &&
          historyOlderRow &&
          historyNewerRow &&
          histVLo != null &&
          histVHi != null ? (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-200 bg-slate-100/90 px-4 py-4 sm:px-6 sm:py-5">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  History compare (snapshots only)
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">
                    Version {histVLo}
                  </span>{" "}
                  vs{" "}
                  <span className="font-semibold text-slate-800">
                    Version {histVHi}
                  </span>
                  . Redline only—use draft review to build proposals from your
                  current edits.
                </p>
              </div>
              <div className="p-4 sm:p-6 lg:p-8">
                <ContractCompareView
                  key={`${negotiationId}-hist-${histVLo}-${histVHi}`}
                  negotiationId={negotiationId}
                  baselineHtml={historyOlderRow.body_html}
                  workingDraftHtml={historyNewerRow.body_html}
                  baselineLabel={`version ${histVLo}`}
                  showProposalReview={false}
                  compareContextLine={`Version ${histVLo} vs Version ${histVHi} (saved snapshots)`}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-600">
                History compare needs at least two snapshots. Create another
                checkpoint, then pick two versions in the sidebar.
              </p>
            </Card>
          )}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-slate-500">
        Redlines pair sections by heading (with fuzzy matching), then compare
        plain text per section (strike/del markup counts as deleted language).
        Draft review diffs your live editor against a baseline snapshot;
        history compare diffs two saved snapshots.
      </p>
    </>
  );
}

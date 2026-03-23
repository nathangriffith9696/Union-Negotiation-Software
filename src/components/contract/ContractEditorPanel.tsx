"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getNegotiationById } from "@/data/mock";
import {
  buildSectionDiffRows,
  sumChangeTotals,
  type SectionDiffRow,
} from "@/lib/contract-compare";
import { formatDate } from "@/lib/format";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { NegotiationContractVersionInsert } from "@/types/database";

const MOCK_STORAGE_PREFIX = "union-contract-versions:v1:";

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
    return "A version with this number already exists (for example, another tab saved first). Click “Save new version” again.";
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
    err.message.trim() || "Could not save the contract version. Please try again."
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

function ContractCompareView({
  previousHtml,
  selectedHtml,
}: {
  previousHtml: string;
  selectedHtml: string;
}) {
  const rows = useMemo(
    () => buildSectionDiffRows(previousHtml, selectedHtml),
    [previousHtml, selectedHtml]
  );
  const totals = useMemo(() => sumChangeTotals(rows), [rows]);
  const changedRows = useMemo(
    () => rows.filter((r) => r.hasChange),
    [rows]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 shadow-sm ring-1 ring-slate-900/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Detected changes
        </p>
        {changedRows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No textual changes vs the previous saved version.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-800">
              <span className="font-medium text-slate-900">
                {totals.sectionsWithChanges}
              </span>{" "}
              {totals.sectionsWithChanges === 1 ? "section" : "sections"} with
              edits ·{" "}
              <span className="font-medium text-emerald-800">
                +{totals.addedWords} words
              </span>
              {" · "}
              <span className="font-medium text-rose-800">
                −{totals.removedWords} words
              </span>
              <span className="text-slate-500">
                {" "}
                (~{totals.addedChars} / ~{totals.removedChars} characters)
              </span>
            </p>
            <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-slate-200/80 pt-3 sm:max-h-48">
              {changedRows.map((r) => (
                <li
                  key={r.index}
                  className="rounded-md border border-slate-100 bg-white/90 px-2.5 py-2 text-sm shadow-sm"
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
                    <span className="text-slate-500">
                      {" "}
                      (~{r.addedChars} / ~{r.removedChars} chars)
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {changedRows.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Draft proposal candidates
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Read-only summaries from changed sections. Nothing is saved as a
            formal proposal.
          </p>
          <ul className="mt-3 max-h-[min(40vh,18rem)] space-y-3 overflow-y-auto border-t border-slate-100 pt-3">
            {changedRows.map((row) => {
              const changeType = proposalCandidateChangeType(row);
              const snippet = proposalCandidateSnippet(row);
              const typePillClass =
                changeType === "Added language"
                  ? "border-emerald-300/90 bg-emerald-50 text-emerald-900"
                  : changeType === "Removed language"
                    ? "border-rose-300/90 bg-rose-50 text-rose-900"
                    : "border-slate-300 bg-slate-50 text-slate-800";
              return (
                <li
                  key={`proposal-candidate-${row.index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 shadow-sm"
                >
                  <p className="text-sm font-semibold leading-snug text-slate-900">
                    {row.headingLabel}
                  </p>
                  <p className="mt-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typePillClass}`}
                    >
                      {changeType}
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {snippet.length > 0 ? (
                      <span className="line-clamp-4">{snippet}</span>
                    ) : (
                      <span className="italic text-slate-500">
                        No short snippet (e.g. whitespace-only or structural
                        tweak).
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-emerald-800">
                      +{row.addedWords} words added
                    </span>
                    <span className="mx-1.5 text-slate-300" aria-hidden>
                      ·
                    </span>
                    <span className="font-medium text-rose-800">
                      −{row.removedWords} words removed
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed shadow-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Full redline by section
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

        <div className="max-h-[min(52vh,24rem)] space-y-5 overflow-y-auto pr-0.5">
          {changedRows.length === 0 ? (
            <p className="text-slate-600">Nothing to show in the diff.</p>
          ) : (
            changedRows.map((row) => (
              <section
                key={row.index}
                className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {row.headingLabel}
                </h3>
                <div className="whitespace-pre-wrap break-words text-slate-900">
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
    </div>
  );
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
        latestVersionNumber: number | null;
        contentRevision: number;
        versions: ContractVersionItem[];
      }
  >({ kind: "loading" });

  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | null
  >(null);
  const [sidePanelMode, setSidePanelMode] = useState<"preview" | "compare">(
    "preview"
  );
  const [loadedIntoEditorVersion, setLoadedIntoEditorVersion] = useState<
    number | null
  >(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const lastAppliedRevision = useRef<number>(-1);
  const previewContentRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    setLoadState({ kind: "loading" });
    setSaveError(null);
    setSaveSuccess(null);
    setSelectedVersionNumber(null);
    setLoadedIntoEditorVersion(null);
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
      const html =
        latest?.body_html?.trim() ||
        "<p>Start drafting your contract here. Use the toolbar for headings, lists, and emphasis. Saved versions are stored in this browser only until you connect Supabase.</p>";
      setLoadState({
        kind: "ready",
        title: n.title,
        html,
        latestVersionNumber: latest?.version_number ?? null,
        contentRevision: Date.now(),
        versions,
      });
      return;
    }

    try {
      const supabase = createSupabaseClient();
      const [negRes, verRes] = await Promise.all([
        supabase
          .from("negotiations")
          .select("title")
          .eq("id", negotiationId)
          .maybeSingle(),
        supabase
          .from("negotiation_contract_versions")
          .select("id, version_number, body_html, created_at")
          .eq("negotiation_id", negotiationId)
          .order("version_number", { ascending: false }),
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

      const versions = (verRes.data ?? []) as ContractVersionItem[];
      const latest = versions[0] ?? null;

      const html =
        latest?.body_html?.trim() ||
        "<p>Start drafting your collective agreement language here. Format with headings and lists as you would in a word processor. Each “Save new version” stores a snapshot for this negotiation.</p>";

      setLoadState({
        kind: "ready",
        title: (negRes.data as { title: string }).title,
        html,
        latestVersionNumber: latest?.version_number ?? null,
        contentRevision: Date.now(),
        versions,
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
    extensions: [StarterKit],
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

  const selectedVersion =
    loadState.kind === "ready" && selectedVersionNumber !== null
      ? loadState.versions.find(
          (v) => v.version_number === selectedVersionNumber
        ) ?? null
      : null;

  const previousVersion =
    loadState.kind === "ready" &&
    selectedVersion &&
    selectedVersion.version_number > 1
      ? loadState.versions.find(
          (v) => v.version_number === selectedVersion.version_number - 1
        ) ?? null
      : null;

  const outlineTargetsPreview =
    selectedVersion !== null && sidePanelMode === "preview";

  const previewOutline = useMemo(() => {
    if (!outlineTargetsPreview || !selectedVersion) return [];
    return extractHeadingsFromHtml(selectedVersion.body_html);
  }, [outlineTargetsPreview, selectedVersion]);

  const editorOutlineLive = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? extractHeadingsFromEditor(ed) : []),
  });

  const outlineItems: HeadingOutlineItem[] = outlineTargetsPreview
    ? previewOutline
    : (editorOutlineLive ?? []);

  function handleOutlineNavigate(index: number) {
    if (outlineTargetsPreview) {
      scrollToHeadingInRoot(previewContentRef.current, index);
      return;
    }
    if (editor) {
      scrollToHeadingInRoot(editor.view.dom as HTMLElement, index);
      editor.chain().focus().run();
    }
  }

  async function handleSaveNewVersion() {
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

    setSaving(true);
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
        setLoadState((prev) =>
          prev.kind === "ready"
            ? { ...prev, latestVersionNumber: nextVersion, versions }
            : prev
        );
        setLoadedIntoEditorVersion(null);
        if (nextVersion >= 2) {
          setSelectedVersionNumber(nextVersion);
          setSidePanelMode("compare");
        }
        setSaveSuccess(
          `Saved version ${nextVersion} (stored locally in this browser).`
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
      setLoadState((prev) => {
        if (prev.kind !== "ready") return prev;
        return {
          ...prev,
          latestVersionNumber: newRow.version_number,
          versions: [newRow, ...prev.versions],
        };
      });
      setLoadedIntoEditorVersion(null);
      if (nextVersion >= 2) {
        setSelectedVersionNumber(nextVersion);
        setSidePanelMode("compare");
      }
      setSaveSuccess(
        `Saved version ${nextVersion} at ${formatDate(new Date().toISOString())}.`
      );
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message.trim() || "Save failed."
          : "Save failed."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleLoadVersionIntoEditor(version: ContractVersionItem) {
    if (!editor) return;
    editor.commands.setContent(version.body_html);
    setLoadedIntoEditorVersion(version.version_number);
    setSaveError(null);
    setSaveSuccess(null);
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

  const { title, latestVersionNumber, versions } = loadState;

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
            Supabase is not configured. Versions are saved only in this browser
            (local storage) for demo. Connect Supabase to persist contract
            versions in the database.
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
              {outlineTargetsPreview && selectedVersion
                ? `Headings from version ${selectedVersion.version_number} preview`
                : "Headings in your working copy"}
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
                  <li key={`${outlineTargetsPreview ? "p" : "e"}-${h.index}`}>
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
            <div className="border-b border-slate-100 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Working copy
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {latestVersionNumber !== null
                    ? `Latest saved version: ${latestVersionNumber}. Saving creates version ${latestVersionNumber + 1}.`
                    : "No saved version yet. Saving creates version 1."}
                </p>
                {loadedIntoEditorVersion !== null ? (
                  <p className="mt-1.5 text-xs text-slate-600">
                    Editing from saved version {loadedIntoEditorVersion}. Save a
                    new version when ready; this does not overwrite the saved
                    snapshot.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={saving || !editor}
                onClick={() => void handleSaveNewVersion()}
                className="mt-3 w-full shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 sm:mt-0 sm:w-auto"
              >
                {saving ? "Saving…" : "Save new version"}
              </button>
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
              Version history
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Newest first. Select a version to preview or compare to the one
              before it.
            </p>
            {versions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No saved versions yet. Use “Save new version” to create version
                1.
              </p>
            ) : (
              <ul className="mt-4 max-h-[min(50vh,22rem)] space-y-1 overflow-y-auto border-t border-slate-100 pt-3">
                {versions.map((v) => {
                  const selected = selectedVersionNumber === v.version_number;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVersionNumber(v.version_number);
                          setSidePanelMode("preview");
                        }}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                        }`}
                      >
                        <span className="font-medium text-slate-900">
                          Version {v.version_number}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {formatDate(v.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {selectedVersion ? (
            <Card>
              <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
                <button
                  type="button"
                  onClick={() => setSidePanelMode("preview")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    sidePanelMode === "preview"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanelMode("compare")}
                  disabled={selectedVersion.version_number < 2}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    sidePanelMode === "compare"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Compare to previous
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Version {selectedVersion.version_number} ·{" "}
                {formatDate(selectedVersion.created_at)}
              </p>

              <button
                type="button"
                disabled={!editor}
                onClick={() => handleLoadVersionIntoEditor(selectedVersion)}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Open in editor
              </button>

              {sidePanelMode === "preview" ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Read-only preview
                  </p>
                  <div
                    ref={previewContentRef}
                    className="contract-editor-rich-preview max-h-[min(60vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-4 text-sm leading-relaxed text-slate-800 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-2"
                    dangerouslySetInnerHTML={{
                      __html: selectedVersion.body_html,
                    }}
                  />
                </div>
              ) : previousVersion ? (
                <div className="mt-4">
                  <ContractCompareView
                    previousHtml={previousVersion.body_html}
                    selectedHtml={selectedVersion.body_html}
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  There is no previous version to compare (version 1 is the
                  first snapshot).
                </p>
              )}
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-600">
                Select a version in the history to see a read-only preview, run
                a simple redline against the prior version, or open it in the
                editor as your working copy.
              </p>
            </Card>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Redlines pair sections by heading (with fuzzy matching), then compare
        plain text per section (strike/del markup counts as deleted language).
        Later work can tie diffs to formal proposals and finer-grained track
        changes.
      </p>
    </>
  );
}

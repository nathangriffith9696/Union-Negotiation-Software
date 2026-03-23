"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { diffWordsWithSpace } from "diff";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getNegotiationById } from "@/data/mock";
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

function htmlToPlainForDiff(html: string): string {
  if (typeof document === "undefined") return "";
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.innerText || "").replace(/\u00a0/g, " ").trim();
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

function RedlineCompare({
  previousPlain,
  selectedPlain,
}: {
  previousPlain: string;
  selectedPlain: string;
}) {
  const parts = diffWordsWithSpace(previousPlain, selectedPlain);
  return (
    <div className="max-h-[min(60vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Changes vs previous version
      </p>
      <p className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-200 align-middle" />{" "}
          Removed
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-200 align-middle" />{" "}
          Added
        </span>
      </p>
      <div className="text-slate-900">
        {parts.map((part, i) => {
          if (part.added) {
            return (
              <span
                key={i}
                className="rounded-sm bg-emerald-100/90 px-0.5 text-emerald-950"
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={i}
                className="rounded-sm bg-red-100/90 px-0.5 text-red-900 line-through decoration-red-600"
              >
                {part.value}
              </span>
            );
          }
          return <span key={i}>{part.value}</span>;
        })}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { bold, italic, h2, bulletList, orderedList, blockquote } =
    useEditorState({
      editor,
      selector: (snap) => ({
        bold: snap.editor.isActive("bold"),
        italic: snap.editor.isActive("italic"),
        h2: snap.editor.isActive("heading", { level: 2 }),
        bulletList: snap.editor.isActive("bulletList"),
        orderedList: snap.editor.isActive("orderedList"),
        blockquote: snap.editor.isActive("blockquote"),
      }),
    });

  const btn =
    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40";
  const idle = "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50";
  const on = "bg-slate-200 text-slate-900 border border-slate-300";

  return (
    <div
      className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/90 px-2 py-2"
      role="toolbar"
      aria-label="Contract formatting"
    >
      <button
        type="button"
        className={`${btn} ${bold ? on : idle}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-pressed={bold}
      >
        Bold
      </button>
      <button
        type="button"
        className={`${btn} ${italic ? on : idle}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-pressed={italic}
      >
        Italic
      </button>
      <button
        type="button"
        className={`${btn} ${h2 ? on : idle}`}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        aria-pressed={h2}
      >
        Heading
      </button>
      <button
        type="button"
        className={`${btn} ${bulletList ? on : idle}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-pressed={bulletList}
      >
        Bullets
      </button>
      <button
        type="button"
        className={`${btn} ${orderedList ? on : idle}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-pressed={orderedList}
      >
        Numbered
      </button>
      <button
        type="button"
        className={`${btn} ${blockquote ? on : idle}`}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-pressed={blockquote}
      >
        Quote
      </button>
      <button
        type="button"
        className={btn + " " + idle}
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

  const selectedVersion =
    selectedVersionNumber === null
      ? null
      : versions.find((v) => v.version_number === selectedVersionNumber) ??
        null;

  const previousVersion =
    selectedVersion && selectedVersion.version_number > 1
      ? versions.find(
          (v) => v.version_number === selectedVersion.version_number - 1
        ) ?? null
      : null;

  const previousPlain =
    previousVersion != null ? htmlToPlainForDiff(previousVersion.body_html) : "";
  const selectedPlain =
    selectedVersion != null ? htmlToPlainForDiff(selectedVersion.body_html) : "";

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
        <div className="min-w-0 flex-1 space-y-4">
          <Card className="overflow-hidden p-0">
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
                    className="max-h-[min(60vh,28rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-4 text-sm leading-relaxed text-slate-800 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{
                      __html: selectedVersion.body_html,
                    }}
                  />
                </div>
              ) : previousVersion ? (
                <div className="mt-4">
                  <RedlineCompare
                    previousPlain={previousPlain}
                    selectedPlain={selectedPlain}
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
        Redlines use plain text extracted from the saved HTML (MVP). Later work
        can tie diffs to formal proposals and finer-grained track changes.
      </p>
    </>
  );
}

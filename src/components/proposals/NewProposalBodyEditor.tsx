"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { forwardRef, useImperativeHandle } from "react";
import type { Editor } from "@tiptap/core";
import { TipTapTablePopover } from "@/components/tiptap/TipTapTablePopover";
import { contractEditorTipTapExtensions } from "@/lib/tiptap-contract-editor-extensions";

export type NewProposalBodyEditorHandle = {
  /** Returns `null` when the document is empty (no visible text). */
  getHtmlForSave: () => string | null;
};

function stripTagsForEmptyCheck(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/[\u00a0\u200b\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return (wrap.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\ufeff/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when there is no user-visible text and no solo structural element we treat as content. */
function isEffectivelyEmptyProposalBody(html: string): boolean {
  if (stripTagsForEmptyCheck(html) !== "") return false;
  if (typeof document === "undefined") {
    return !/<\s*hr\b/i.test(html);
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  if (wrap.querySelector("hr")) return false;
  if (wrap.querySelector("table")) return false;
  return true;
}

function ProposalBodyToolbar({ editor }: { editor: Editor | null }) {
  const s = useEditorState({
    editor,
    selector: (snap) => {
      const ed = snap.editor;
      if (!ed) {
        return {
          bold: false,
          italic: false,
          strike: false,
          h2: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          code: false,
          codeBlock: false,
          inTable: false,
        };
      }
      return {
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        strike: ed.isActive("strike"),
        h2: ed.isActive("heading", { level: 2 }),
        bulletList: ed.isActive("bulletList"),
        orderedList: ed.isActive("orderedList"),
        blockquote: ed.isActive("blockquote"),
        code: ed.isActive("code"),
        codeBlock: ed.isActive("codeBlock"),
        inTable: ed.isActive("table"),
      };
    },
  });

  const t = s ?? {
    bold: false,
    italic: false,
    strike: false,
    h2: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    inTable: false,
  };

  const blockBtn =
    "rounded-md border px-2 py-1 text-xs font-medium transition-colors";
  const blockIdle =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const blockOn = "border-slate-300 bg-slate-200 text-slate-900";
  const inlineBtn =
    "rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const inlineIdle =
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const inlineOn = "border-slate-300 bg-slate-200 text-slate-900";

  if (!editor) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b border-slate-200 bg-slate-50/90 px-2 py-1.5"
      role="toolbar"
      aria-label="Proposal language formatting"
    >
      <button
        type="button"
        className={`${inlineBtn} ${t.bold ? inlineOn : inlineIdle}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-pressed={t.bold}
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        className={`${inlineBtn} ${t.italic ? inlineOn : inlineIdle}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-pressed={t.italic}
        title="Italic"
      >
        I
      </button>
      <button
        type="button"
        className={`${inlineBtn} ${t.strike ? inlineOn : inlineIdle}`}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-pressed={t.strike}
        title="Strikethrough"
      >
        S
      </button>
      <button
        type="button"
        className={`${inlineBtn} ${t.code ? inlineOn : inlineIdle}`}
        onClick={() => editor.chain().focus().toggleCode().run()}
        aria-pressed={t.code}
        title="Inline code"
      >
        Mono
      </button>
      <span
        className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:inline-block"
        aria-hidden
      />
      <button
        type="button"
        className={`${blockBtn} ${t.h2 ? blockOn : blockIdle}`}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        aria-pressed={t.h2}
      >
        Heading
      </button>
      <button
        type="button"
        className={`${blockBtn} ${t.bulletList ? blockOn : blockIdle}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-pressed={t.bulletList}
      >
        Bullets
      </button>
      <button
        type="button"
        className={`${blockBtn} ${t.orderedList ? blockOn : blockIdle}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-pressed={t.orderedList}
      >
        1. 2.
      </button>
      <button
        type="button"
        className={`${blockBtn} ${t.blockquote ? blockOn : blockIdle}`}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-pressed={t.blockquote}
      >
        Quote
      </button>
      <button
        type="button"
        className={`${blockBtn} ${t.codeBlock ? blockOn : blockIdle}`}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-pressed={t.codeBlock}
      >
        Pre
      </button>
      <button
        type="button"
        className={`${blockBtn} ${blockIdle}`}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        Rule
      </button>
      <span
        className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:inline-block"
        aria-hidden
      />
      <TipTapTablePopover
        editor={editor}
        inTable={t.inTable}
        variant="proposal"
      />
    </div>
  );
}

export const NewProposalBodyEditor = forwardRef<NewProposalBodyEditorHandle>(
  function NewProposalBodyEditor(_props, ref) {
  const editor = useEditor({
    extensions: contractEditorTipTapExtensions,
    content: "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "proposal-modal-body-editor ProseMirror min-h-[10rem] max-h-[min(40vh,16rem)] overflow-y-auto px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none",
        spellCheck: "true",
      },
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      getHtmlForSave() {
        if (!editor) return null;
        const html = editor.getHTML().trim();
        if (isEffectivelyEmptyProposalBody(html)) return null;
        return html;
      },
    }),
    [editor]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
      {editor ? (
        <ProposalBodyToolbar editor={editor} />
      ) : (
        <div
          className="h-9 border-b border-slate-200 bg-slate-50/90"
          aria-hidden
        />
      )}
      <EditorContent editor={editor} />
    </div>
  );
});

NewProposalBodyEditor.displayName = "NewProposalBodyEditor";

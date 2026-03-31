"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const ROW_MAX = 50;
const COL_MAX = 30;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

const styles = {
  contract: {
    trigger:
      "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
    triggerOn: "border-slate-300 bg-slate-200 text-slate-900",
    triggerIdle:
      "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    panel:
      "absolute left-0 top-full z-50 -mt-1 w-[min(100vw-1rem,17.5rem)] rounded-lg border border-slate-200 bg-white p-3 pt-3.5 text-xs text-slate-800 shadow-lg ring-1 ring-slate-900/[0.06]",
    label: "text-[11px] font-medium text-slate-600",
    input:
      "w-full min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-xs tabular-nums text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300",
    btn:
      "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
    btnPrimary:
      "w-full rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-center text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800",
    btnDanger:
      "w-full rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-red-800 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40",
    grid2: "grid grid-cols-2 gap-2",
    hr: "my-2.5 border-t border-slate-100",
    hint: "text-[10px] leading-snug text-slate-500",
  },
  proposal: {
    trigger:
      "inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
    triggerOn: "border-slate-300 bg-slate-200 text-slate-900",
    triggerIdle:
      "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    panel:
      "absolute left-0 top-full z-50 -mt-1 w-[min(100vw-1rem,16rem)] rounded-lg border border-slate-200 bg-white p-2.5 pt-3 text-[11px] text-slate-800 shadow-lg ring-1 ring-slate-900/[0.06]",
    label: "text-[10px] font-medium text-slate-600",
    input:
      "w-full min-w-0 rounded border border-slate-200 px-1.5 py-1 text-[11px] tabular-nums text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300",
    btn:
      "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[11px] font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
    btnPrimary:
      "w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-center text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800",
    btnDanger:
      "w-full rounded-md border border-red-200 bg-white px-2 py-1 text-left text-[11px] font-medium text-red-800 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40",
    grid2: "grid grid-cols-2 gap-1.5",
    hr: "my-2 border-t border-slate-100",
    hint: "text-[9px] leading-snug text-slate-500",
  },
} as const;

export type TipTapTablePopoverVariant = keyof typeof styles;

type TipTapTablePopoverProps = {
  editor: Editor;
  /** From toolbar selector: cursor inside a table */
  inTable: boolean;
  variant: TipTapTablePopoverVariant;
};

export function TipTapTablePopover({
  editor,
  inTable,
  variant,
}: TipTapTablePopoverProps) {
  const s = styles[variant];
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(4);
  const [withHeader, setWithHeader] = useState(true);
  const [finePointer, setFinePointer] = useState(false);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const insertTable = useCallback(() => {
    const r = clampInt(rows, 1, ROW_MAX);
    const c = clampInt(cols, 1, COL_MAX);
    setRows(r);
    setCols(c);
    editor.chain().focus().insertTable({
      rows: r,
      cols: c,
      withHeaderRow: withHeader,
    }).run();
    close();
  }, [editor, rows, cols, withHeader, close]);

  const triggerActive = open || inTable;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onMouseEnter={() => {
        if (finePointer) setOpen(true);
      }}
      onMouseLeave={() => {
        if (finePointer) setOpen(false);
      }}
    >
      <button
        type="button"
        className={`${s.trigger} ${triggerActive ? s.triggerOn : s.triggerIdle}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((v) => !v)}
        title="Table — hover or click to set size and insert; edit the current table when the cursor is in a table"
      >
        Table
        <span className="text-[10px] opacity-70" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          className={s.panel}
          role="dialog"
          aria-labelledby={titleId}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p id={titleId} className="mb-2 font-semibold text-slate-900">
            Table
          </p>

          <p className={`${s.label} mb-1.5`}>New table at cursor</p>
          <div className={s.grid2}>
            <label className="flex flex-col gap-0.5">
              <span className={s.label}>Rows</span>
              <input
                type="number"
                min={1}
                max={ROW_MAX}
                value={rows}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setRows(Number.isFinite(n) ? n : 1);
                }}
                onBlur={() => setRows((r) => clampInt(r, 1, ROW_MAX))}
                className={s.input}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={s.label}>Columns</span>
              <input
                type="number"
                min={1}
                max={COL_MAX}
                value={cols}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCols(Number.isFinite(n) ? n : 1);
                }}
                onBlur={() => setCols((c) => clampInt(c, 1, COL_MAX))}
                className={s.input}
              />
            </label>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={withHeader}
              onChange={(e) => setWithHeader(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
            />
            <span className={s.label}>Header row</span>
          </label>
          <button
            type="button"
            className={`${s.btnPrimary} mt-2.5`}
            onClick={insertTable}
          >
            Insert table
          </button>
          <p className={`${s.hint} mt-1.5`}>
            Max {ROW_MAX}×{COL_MAX}. Tab moves between cells. With the cursor in
            a table, use This table to add or delete rows, columns, or merge
            cells.
          </p>

          {inTable ? (
            <>
              <div className={s.hr} />
              <p className={`${s.label} mb-1.5`}>This table</p>
              <p className={`${s.label} mb-1`}>Rows</p>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={s.btn}
                  disabled={!editor.can().addRowBefore()}
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run();
                    close();
                  }}
                >
                  Add row above
                </button>
                <button
                  type="button"
                  className={s.btn}
                  disabled={!editor.can().addRowAfter()}
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    close();
                  }}
                >
                  Add row below
                </button>
                <button
                  type="button"
                  className={s.btnDanger}
                  disabled={!editor.can().deleteRow()}
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    close();
                  }}
                >
                  Delete this row
                </button>
              </div>
              <p className={`${s.label} mb-1 mt-2`}>Columns</p>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={s.btn}
                  disabled={!editor.can().addColumnBefore()}
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run();
                    close();
                  }}
                >
                  Add column left
                </button>
                <button
                  type="button"
                  className={s.btn}
                  disabled={!editor.can().addColumnAfter()}
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    close();
                  }}
                >
                  Add column right
                </button>
                <button
                  type="button"
                  className={s.btnDanger}
                  disabled={!editor.can().deleteColumn()}
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    close();
                  }}
                >
                  Delete this column
                </button>
              </div>
              <p className={`${s.label} mb-1 mt-2`}>Cells</p>
              <p className={`${s.hint} mb-1.5`}>
                Select multiple cells (drag or Shift+arrows), then merge; split
                restores one cell per row/column.
              </p>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={s.btn}
                  disabled={!editor.can().mergeCells()}
                  onClick={() => {
                    editor.chain().focus().mergeCells().run();
                    close();
                  }}
                >
                  Merge selected cells
                </button>
                <button
                  type="button"
                  className={s.btn}
                  disabled={!editor.can().splitCell()}
                  onClick={() => {
                    editor.chain().focus().splitCell().run();
                    close();
                  }}
                >
                  Split cell
                </button>
              </div>
              <div className={`${s.hr} my-2.5`} />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={s.btn}
                  onClick={() => {
                    editor.chain().focus().toggleHeaderRow().run();
                  }}
                >
                  Toggle header row
                </button>
                <button
                  type="button"
                  className={s.btnDanger}
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    close();
                  }}
                >
                  Delete entire table
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

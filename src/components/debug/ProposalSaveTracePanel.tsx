"use client";

import { useEffect, useState } from "react";
import {
  clearProposalSaveTrace,
  readProposalSaveTrace,
  writeProposalSaveTrace,
  type ProposalSaveTraceV1,
} from "@/lib/proposal-save-trace";

type RowLite = { id: string; bodyHtml: string | null; title: string };

/**
 * Shows session trace from the last Article 1 draft save (when capture was enabled).
 * Enrich step 8 from the proposals list `rows` once loaded.
 */
export function ProposalSaveTracePanel({
  rows,
  listReady,
}: {
  rows: RowLite[];
  listReady: boolean;
}) {
  const [trace, setTrace] = useState<ProposalSaveTraceV1 | null>(null);

  useEffect(() => {
    setTrace(readProposalSaveTrace());
  }, []);

  useEffect(() => {
    if (!listReady) return;
    const t = readProposalSaveTrace();
    if (!t || t.proposalsListPhase === "done") return;
    const pid = t.resolvedProposalId;
    if (!pid) {
      const next: ProposalSaveTraceV1 = {
        ...t,
        proposalsListPhase: "done",
        proposalsListBodyHtml: null,
        proposalsListRowFound: false,
      };
      writeProposalSaveTrace(next);
      setTrace(next);
      return;
    }
    const hit = rows.find((r) => r.id === pid);
    const next: ProposalSaveTraceV1 = {
      ...t,
      proposalsListPhase: "done",
      proposalsListBodyHtml: hit?.bodyHtml ?? null,
      proposalsListRowFound: !!hit,
    };
    writeProposalSaveTrace(next);
    setTrace(next);
  }, [listReady, rows]);

  if (!trace) return null;

  const dbBody =
    trace.postSaveFetch?.row &&
    typeof trace.postSaveFetch.row.body_html === "string"
      ? trace.postSaveFetch.row.body_html
      : trace.postSaveFetch?.row?.body_html == null
        ? null
        : String(trace.postSaveFetch.row.body_html);

  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
  };

  return (
    <div className="print:hidden fixed bottom-0 left-0 right-0 z-[80] max-h-[min(85vh,32rem)] border-t-2 border-amber-500 bg-amber-50 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-100/90 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-950">
          Debug: Article 1 proposal save trace (localStorage{" "}
          <code className="rounded bg-white/80 px-1">unionDebugProposalSaveTrace=1</code>)
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-950"
            onClick={() => void copyJson()}
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-950"
            onClick={() => {
              clearProposalSaveTrace();
              setTrace(null);
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
      <div className="max-h-[min(75vh,28rem)] space-y-3 overflow-auto p-3 text-xs text-amber-950">
        <section>
          <h3 className="font-semibold text-amber-900">1. headingLabel</h3>
          <pre className="mt-1 whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.headingLabel}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">
            2. Raw diff row newBodyHtml (before bold wrap)
          </h3>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.rawNewBodyHtml || "—"}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">
            3. Wrapped body_html (value saved)
          </h3>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.wrappedBodyHtml ?? "—"}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">
            4. Matched existing draft proposal id
          </h3>
          <pre className="mt-1 whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.matchedDraftProposalId ?? "null"}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">5. UPDATE vs INSERT</h3>
          <pre className="mt-1 whitespace-pre-wrap rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.action}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">
            6. Exact payload / patch sent to Supabase
          </h3>
          <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.supabasePayload
              ? JSON.stringify(trace.supabasePayload, null, 2)
              : "—"}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">
            7. Row read back from DB immediately after save
          </h3>
          <p className="mt-0.5 text-[11px] text-amber-800">
            ok={String(trace.postSaveFetch?.ok ?? false)}
            {trace.postSaveFetch?.error
              ? ` · error=${trace.postSaveFetch.error}`
              : ""}
            {trace.postSaveFetch?.insertSelectCount != null
              ? ` · insertSelectCount=${trace.postSaveFetch.insertSelectCount}`
              : ""}
          </p>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.postSaveFetch?.row
              ? JSON.stringify(trace.postSaveFetch.row, null, 2)
              : "—"}
          </pre>
          <p className="mt-1 font-semibold text-amber-900">
            body_html from that row (extracted)
          </p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {dbBody ?? "—"}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold text-amber-900">
            8. body_html from proposals list / card (same proposal id)
          </h3>
          <p className="mt-0.5 text-[11px] text-amber-800">
            resolvedProposalId={trace.resolvedProposalId ?? "null"} · rowFound=
            {String(trace.proposalsListRowFound)} · phase=
            {trace.proposalsListPhase}
          </p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white p-2 font-mono">
            {trace.proposalsListPhase === "pending"
              ? "(waiting for proposals list to load…)"
              : trace.proposalsListBodyHtml ?? "—"}
          </pre>
        </section>
        {trace.overwrittenPriorTrace ? (
          <p className="rounded border border-amber-300 bg-amber-100 p-2 text-[11px]">
            Note: more than one included row matched Article 1; this trace was
            overwritten by a later row in the same save loop.
          </p>
        ) : null}
      </div>
    </div>
  );
}

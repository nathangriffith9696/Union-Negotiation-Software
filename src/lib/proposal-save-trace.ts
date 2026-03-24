import { extractArticleNumberFromTitle } from "@/lib/proposal-article-sort";

/**
 * One-shot end-to-end trace for Article 1 draft-review → Supabase → proposals list.
 *
 * Enable capture (browser console): localStorage.setItem("unionDebugProposalSaveTrace", "1")
 * Disable: localStorage.removeItem("unionDebugProposalSaveTrace")
 */
export const PROPOSAL_SAVE_TRACE_STORAGE_KEY = "union:debug:proposal-save-trace:v1";

export function isProposalSaveTraceCaptureEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("unionDebugProposalSaveTrace") === "1";
  } catch {
    return false;
  }
}

/** Only numbered "Article 1" headings (same extractor as bargaining sort). */
export function shouldCaptureProposalSaveTraceArticle1(
  headingLabel: string
): boolean {
  return extractArticleNumberFromTitle(headingLabel) === 1;
}

export type ProposalSaveTracePostSave = {
  ok: boolean;
  error: string | null;
  /** Raw Supabase row JSON (serializable). */
  row: Record<string, unknown> | null;
  insertSelectCount?: number;
};

export type ProposalSaveTraceV1 = {
  v: 1;
  capturedAtIso: string;
  negotiationId: string;
  headingLabel: string;
  rawNewBodyHtml: string;
  wrappedBodyHtml: string | null;
  matchedDraftProposalId: string | null;
  action: "UPDATE" | "INSERT";
  supabasePayload: Record<string, unknown> | null;
  resolvedProposalId: string | null;
  postSaveFetch: ProposalSaveTracePostSave | null;
  /** Filled on /proposals after the scoped list loads */
  proposalsListPhase: "pending" | "done";
  proposalsListBodyHtml: string | null;
  proposalsListRowFound: boolean;
  overwrittenPriorTrace?: boolean;
};

export function readProposalSaveTrace(): ProposalSaveTraceV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROPOSAL_SAVE_TRACE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return null;
    const o = p as ProposalSaveTraceV1;
    if (o.v !== 1) return null;
    return o;
  } catch {
    return null;
  }
}

export function writeProposalSaveTrace(trace: ProposalSaveTraceV1): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      PROPOSAL_SAVE_TRACE_STORAGE_KEY,
      JSON.stringify(trace)
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearProposalSaveTrace(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PROPOSAL_SAVE_TRACE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

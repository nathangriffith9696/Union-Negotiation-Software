import type { SectionDiffRow } from "@/lib/contract-compare";

/** Rows returned from Supabase for negotiation-scoped reconciliation. */
export type SavedProposalForReconcile = {
  id: string;
  title: string;
  body_html: string | null;
};

const ELLIPSIS = "…";

function stripWasSuffix(label: string): string {
  return label.replace(/\s*\(was:\s*[^)]*\)\s*$/i, "").trim();
}

/** Normalize heading or saved title for comparison (conservative, case-insensitive). */
export function normalizeProposalHeadingForMatch(s: string): string {
  return stripWasSuffix(s)
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function defaultDraftTitleFromHeading(headingLabel: string): string {
  return headingLabel.length > 90
    ? `${headingLabel.slice(0, 87)}${ELLIPSIS}`
    : headingLabel;
}

function headingsRoughlyEqual(a: string, b: string): boolean {
  const na = normalizeProposalHeadingForMatch(a);
  const nb = normalizeProposalHeadingForMatch(b);
  if (na === nb) return true;
  if (nb.endsWith(ELLIPSIS) && na.startsWith(nb.slice(0, -ELLIPSIS.length)))
    return true;
  if (na.endsWith(ELLIPSIS) && nb.startsWith(na.slice(0, -ELLIPSIS.length)))
    return true;
  return false;
}

/** True if saved proposal title aligns with section heading or default truncated title. */
export function titlesAlignForProposal(
  headingLabel: string,
  savedTitle: string
): boolean {
  const def = defaultDraftTitleFromHeading(headingLabel);
  return (
    headingsRoughlyEqual(headingLabel, savedTitle) ||
    headingsRoughlyEqual(def, savedTitle)
  );
}

/**
 * Normalize stored or candidate HTML for equality checks: unwrap &lt;strong&gt;,
 * collapse whitespace, lowercase. Keeps matching practical across minor markup noise.
 */
export function normalizeProposalBodyHtmlForMatch(html: string): string {
  return html
    .replace(/\u00a0/g, " ")
    .replace(/<\/?strong>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function bodiesMatch(canonicalRowBody: string, savedBody: string | null): boolean {
  const a = normalizeProposalBodyHtmlForMatch(canonicalRowBody);
  const b = normalizeProposalBodyHtmlForMatch(savedBody ?? "");
  if (!a && !b) return true;
  return a === b;
}

export function proposalMatchesDiffCandidate(
  row: SectionDiffRow,
  canonicalRowBody: string,
  saved: SavedProposalForReconcile
): boolean {
  if (!titlesAlignForProposal(row.headingLabel, saved.title)) return false;
  return bodiesMatch(canonicalRowBody, saved.body_html);
}

/**
 * Greedy one-to-one match: each saved row used at most once; prefer newest proposals first
 * (pass `saved` already ordered by created_at desc).
 */
export function matchChangedRowsToSavedProposals(
  changedRows: SectionDiffRow[],
  saved: SavedProposalForReconcile[],
  getCanonicalRowBody: (row: SectionDiffRow) => string
): Map<number, SavedProposalForReconcile> {
  const used = new Set<string>();
  const out = new Map<number, SavedProposalForReconcile>();

  for (const row of changedRows) {
    const canon = getCanonicalRowBody(row);
    for (const p of saved) {
      if (used.has(p.id)) continue;
      if (proposalMatchesDiffCandidate(row, canon, p)) {
        out.set(row.index, p);
        used.add(p.id);
        break;
      }
    }
  }

  return out;
}

import type { SectionDiffRow } from "@/lib/contract-compare";
import { extractArticleNumberFromTitle } from "@/lib/proposal-article-sort";
import type { ProposalStatus } from "@/types/database";

/** Rows returned from Supabase for negotiation-scoped reconciliation. */
export type SavedProposalForReconcile = {
  id: string;
  title: string;
  body_html: string | null;
  status: ProposalStatus;
  /** ISO timestamp; list should be ordered `created_at` descending for newest-first picks. */
  created_at: string;
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
 * Draft update lookup: when **both** sides have an extracted article number, match on that;
 * otherwise fall back to {@link titlesAlignForProposal} (preamble, side letters, etc.).
 */
function draftRowAlignsWithSavedTitle(
  headingLabel: string,
  savedTitle: string
): boolean {
  const nh = extractArticleNumberFromTitle(stripWasSuffix(headingLabel));
  const ns = extractArticleNumberFromTitle(stripWasSuffix(savedTitle));
  if (nh !== null && ns !== null) return nh === ns;
  return titlesAlignForProposal(headingLabel, savedTitle);
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

/**
 * Draft-review save path: find an existing **draft** to update for this section (not body
 * equality). Prefers matching by extracted article number when both sides have one; otherwise
 * {@link titlesAlignForProposal}. `saved` should be negotiation-scoped and ordered by
 * `created_at` descending so the first matching draft is the newest.
 */
export function findNewestAligningDraftProposalId(
  headingLabel: string,
  saved: SavedProposalForReconcile[]
): string | null {
  for (const p of saved) {
    if (p.status !== "draft") continue;
    if (!draftRowAlignsWithSavedTitle(headingLabel, p.title)) continue;
    return p.id;
  }
  return null;
}

/**
 * One save key per logical proposal: numbered articles share `article:N`; preamble / MOU / LOU / etc.
 * use a normalized heading key so duplicate rows in one save merge instead of colliding on the same draft id.
 */
export function proposalSaveGroupKey(headingLabel: string): string {
  const stripped = stripWasSuffix(headingLabel);
  const n = extractArticleNumberFromTitle(stripped);
  if (n !== null) return `article:${n}`;
  return `heading:${normalizeProposalHeadingForMatch(stripped)}`;
}

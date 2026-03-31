import {
  buildProposalBodyHtmlForBaselineSnapshot,
  type SectionDiffRow,
} from "@/lib/contract-compare";
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
  // Only drafts represent the editable proposal line. Submitted (or other) rows are
  // historical snapshots: matching them would hide sections that still differ from the
  // current draft after a grouped save (draft body is merged; submitted may be a partial
  // or older snapshot that equals one subsection’s canonical HTML).
  if (saved.status !== "draft") return false;
  if (!titlesAlignForProposal(row.headingLabel, saved.title)) return false;
  return bodiesMatch(canonicalRowBody, saved.body_html);
}

/**
 * Merges per-row canonical bodies in diff-index order — same concatenation as grouped save
 * ({@link proposalSaveGroupKey} batches, then ascending `row.index`).
 */
export function mergedCanonicalBodyForProposalGroup(
  groupRows: SectionDiffRow[],
  getCanonicalRowBody: (row: SectionDiffRow) => string
): string {
  const sorted = [...groupRows].sort((a, b) => a.index - b.index);
  return sorted.map((r) => getCanonicalRowBody(r)).join("");
}

/**
 * Group-level reconciliation aligned with grouped save: each {@link proposalSaveGroupKey}
 * bucket compares **once** against the **newest aligning draft** only
 * ({@link findNewestAligningDraftProposalId}). Merged canonical body must equal that draft’s
 * `body_html` (normalized HTML equality) for every changed row in the group to count as
 * already saved. Older partial drafts are never consulted.
 */
export function matchChangedRowsToSavedProposals(
  changedRows: SectionDiffRow[],
  saved: SavedProposalForReconcile[],
  getCanonicalRowBody: (row: SectionDiffRow) => string
): Map<number, SavedProposalForReconcile> {
  const out = new Map<number, SavedProposalForReconcile>();
  const savedById = new Map(saved.map((p) => [p.id, p] as const));

  const byGroup = new Map<string, SectionDiffRow[]>();
  for (const row of changedRows) {
    const k = proposalSaveGroupKey(row.headingLabel);
    const g = byGroup.get(k);
    if (g) g.push(row);
    else byGroup.set(k, [row]);
  }

  for (const rows of byGroup.values()) {
    rows.sort((a, b) => a.index - b.index);
    const primary = rows[0]!;
    const draftId = findNewestAligningDraftProposalId(
      primary.headingLabel,
      saved
    );
    if (!draftId) continue;

    const p = savedById.get(draftId);
    if (!p || p.status !== "draft") continue;

    const mergedCanon = mergedCanonicalBodyForProposalGroup(
      rows,
      getCanonicalRowBody
    );
    if (!bodiesMatch(mergedCanon, p.body_html)) continue;

    for (const r of rows) {
      out.set(r.index, p);
    }
  }

  return out;
}

/**
 * When working copy matches the snapshot in strike-stripped plain text (so {@link buildSectionDiffRows}
 * yields `hasChange: false`) but the **newest aligning draft** `body_html` still reflects older
 * markup or wording, force `hasChange: true` on every row in that proposal group so draft review
 * stays actionable — unless merged canonical HTML already matches the **baseline snapshot** (user
 * fully reverted); then a stale draft mismatch is ignored.
 */
export function markSectionRowsWhenProposalDraftDrifts(
  rows: SectionDiffRow[],
  saved: SavedProposalForReconcile[],
  getCanonicalRowBody: (row: SectionDiffRow) => string
): SectionDiffRow[] {
  if (rows.length === 0 || saved.length === 0) return rows;

  const savedById = new Map(saved.map((p) => [p.id, p] as const));

  const byGroup = new Map<string, SectionDiffRow[]>();
  for (const row of rows) {
    const k = proposalSaveGroupKey(row.headingLabel);
    const g = byGroup.get(k);
    if (g) g.push(row);
    else byGroup.set(k, [row]);
  }

  const driftIndices = new Set<number>();

  for (const groupRows of byGroup.values()) {
    groupRows.sort((a, b) => a.index - b.index);
    const primary = groupRows[0]!;
    const draftId = findNewestAligningDraftProposalId(
      primary.headingLabel,
      saved
    );
    if (!draftId) continue;

    const p = savedById.get(draftId);
    if (!p || p.status !== "draft") continue;

    const mergedCanon = mergedCanonicalBodyForProposalGroup(
      groupRows,
      getCanonicalRowBody
    );
    if (bodiesMatch(mergedCanon, p.body_html)) continue;

    const mergedBaselineCanon = mergedCanonicalBodyForProposalGroup(
      groupRows,
      buildProposalBodyHtmlForBaselineSnapshot
    );
    if (bodiesMatch(mergedCanon, mergedBaselineCanon)) continue;

    for (const r of groupRows) {
      driftIndices.add(r.index);
    }
  }

  if (driftIndices.size === 0) return rows;

  return rows.map((r) =>
    driftIndices.has(r.index) ? { ...r, hasChange: true } : r
  );
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

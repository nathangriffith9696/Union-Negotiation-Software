/** Preamble / intro-style headings sort before numbered articles. */
const PREAMBLE_PATTERN =
  /\b(preamble|introduction|intro\.?|prefatory|opening\s+provisions?|cover\s+letter|letter\s+of\s+understanding|mou|memorandum)\b/i;

/** Numeric article: "Article 1", "ARTICLE 12 — …", etc. */
const ARTICLE_NUM_PATTERN = /\barticle\s+(\d+)\b/i;

/**
 * First `Article N` index in the string (case-insensitive), or `null` if none.
 * Matches {@link proposalArticleSortKey} / bargaining-order logic.
 */
export function extractArticleNumberFromTitle(title: string): number | null {
  const t = title.trim();
  if (!t) return null;
  const articleMatch = ARTICLE_NUM_PATTERN.exec(t);
  if (!articleMatch) return null;
  const n = Number.parseInt(articleMatch[1]!, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

type ArticleSortBucket = "preamble" | "article" | "other";

export type ProposalArticleSortKey = {
  bucket: ArticleSortBucket;
  /** Set only when bucket === "article". */
  articleNumber: number | null;
};

/** Exposed for tests or tooling. */
export function proposalArticleSortKey(title: string): ProposalArticleSortKey {
  const t = title.trim();
  const n = extractArticleNumberFromTitle(t);
  if (n !== null) {
    return { bucket: "article", articleNumber: n };
  }
  if (PREAMBLE_PATTERN.test(t)) {
    return { bucket: "preamble", articleNumber: null };
  }
  return { bucket: "other", articleNumber: null };
}

function bucketOrder(b: ArticleSortBucket): number {
  if (b === "preamble") return 0;
  if (b === "article") return 1;
  return 2;
}

/** Bargaining-table order: preamble → articles by number → other; ties by title, then created time, then id. */
export type BargainingSortable = {
  title: string;
  /** ISO `created_at` from DB (or stable string for mocks). */
  createdAt: string;
  id: string;
};

export function compareProposalsBargainingOrder(
  a: BargainingSortable,
  b: BargainingSortable
): number {
  const ka = proposalArticleSortKey(a.title);
  const kb = proposalArticleSortKey(b.title);
  const oa = bucketOrder(ka.bucket);
  const ob = bucketOrder(kb.bucket);
  if (oa !== ob) return oa - ob;

  if (ka.bucket === "article" && kb.bucket === "article") {
    const num = (ka.articleNumber ?? 0) - (kb.articleNumber ?? 0);
    if (num !== 0) return num;
  }

  const titleCmp = a.title.localeCompare(b.title, undefined, {
    sensitivity: "base",
  });
  if (titleCmp !== 0) return titleCmp;

  const timeCmp = a.createdAt.localeCompare(b.createdAt);
  if (timeCmp !== 0) return timeCmp;

  return a.id.localeCompare(b.id);
}

export function sortProposalsBargainingOrder<T extends BargainingSortable>(
  rows: T[]
): T[] {
  return [...rows].sort(compareProposalsBargainingOrder);
}

/** Same ordering for rows shaped like Supabase `proposals` (`created_at`). */
export function sortProposalsByBargainingOrderSnake<
  T extends { id: string; title: string; created_at: string },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    compareProposalsBargainingOrder(
      { title: a.title, createdAt: a.created_at, id: a.id },
      { title: b.title, createdAt: b.created_at, id: b.id }
    )
  );
}

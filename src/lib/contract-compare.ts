import { diffWordsWithSpace } from "diff";
import type { Change } from "diff";

export type ContractSection = {
  heading: null | string;
  plain: string;
};

export type SectionDiffRow = {
  index: number;
  headingLabel: string;
  parts: Change[];
  addedWords: number;
  removedWords: number;
  addedChars: number;
  removedChars: number;
  hasChange: boolean;
};

type HeadedBlock = { heading: string; plain: string };

/** Minimum heading similarity (0–1) to pair sections after exact key matches. */
const HEADING_FUZZY_THRESHOLD = 0.82;

const STRIKE_TAGS = new Set(["s", "strike", "del"]);

/**
 * Plain text for comparison: like visible text, but entire &lt;s&gt;, &lt;strike&gt;,
 * and &lt;del&gt; subtrees are skipped so struck language behaves as removed in diffs.
 */
function plainTextExcludingStrike(el: HTMLElement): string {
  let out = "";
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const elem = node as Element;
    const tag = elem.tagName.toLowerCase();
    if (STRIKE_TAGS.has(tag)) return;
    for (const c of elem.childNodes) walk(c);
  }
  for (const c of el.childNodes) walk(c);
  return out.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function analyzeParts(parts: Change[]): {
  addedWords: number;
  removedWords: number;
  addedChars: number;
  removedChars: number;
} {
  let addedWords = 0;
  let removedWords = 0;
  let addedChars = 0;
  let removedChars = 0;
  for (const p of parts) {
    if (p.added) {
      addedWords += countWords(p.value);
      addedChars += p.value.length;
    } else if (p.removed) {
      removedWords += countWords(p.value);
      removedChars += p.value.length;
    }
  }
  return { addedWords, removedWords, addedChars, removedChars };
}

/**
 * Split saved contract HTML into sections by top-level h1–h3. Plain text per
 * section skips &lt;s&gt;, &lt;strike&gt;, and &lt;del&gt; so struck text counts
 * as removed in downstream diffs; headings use the same rule for matching labels.
 */
export function buildContractSections(html: string): ContractSection[] {
  if (typeof document === "undefined") {
    return [];
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim() ? html : "";
  const sections: ContractSection[] = [];
  let current: ContractSection | null = null;

  function pushCurrent() {
    if (!current) return;
    const plain = current.plain.replace(/\u00a0/g, " ").trim();
    if (!plain && current.heading === null) {
      current = null;
      return;
    }
    sections.push({ heading: current.heading, plain });
    current = null;
  }

  const children = Array.from(wrap.children);
  if (children.length === 0) {
    const t = plainTextExcludingStrike(wrap);
    if (t) return [{ heading: null, plain: t }];
    return [];
  }

  for (const el of children) {
    const tag = el.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      pushCurrent();
      const hText = plainTextExcludingStrike(el as HTMLElement);
      current = {
        heading: hText.length > 0 ? hText : null,
        plain: "",
      };
    } else {
      if (!current) {
        current = { heading: null, plain: "" };
      }
      const t = plainTextExcludingStrike(el as HTMLElement);
      if (t) {
        current.plain = current.plain ? `${current.plain}\n\n${t}` : t;
      }
    }
  }
  pushCurrent();
  return sections;
}

/**
 * Normalize headings for exact matching (case, punctuation, whitespace).
 */
function normalizeHeadingKey(heading: string): string {
  return heading
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019\u201c\u201d`'".,;:!?/\\|()[\]{}]/gu, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n]!;
}

/**
 * Similarity between two heading strings for fuzzy pairing (0 = unrelated, 1 = same normalized).
 */
function headingSimilarity(a: string, b: string): number {
  const na = normalizeHeadingKey(a);
  const nb = normalizeHeadingKey(b);
  if (na.length === 0 && nb.length === 0) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - d / maxLen;
}

function displayHeading(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t : "Untitled section";
}

/**
 * Preamble = content before the first top-level heading; headed blocks follow
 * document order within each version.
 */
function extractPreambleAndHeaded(
  sections: ContractSection[]
): { preamblePlain: string; headed: HeadedBlock[] } {
  if (sections.length === 0) {
    return { preamblePlain: "", headed: [] };
  }
  let preamblePlain = "";
  let startIdx = 0;
  if (sections[0]!.heading === null) {
    preamblePlain = sections[0]!.plain.replace(/\u00a0/g, " ").trim();
    startIdx = 1;
  }
  const headed: HeadedBlock[] = [];
  for (let i = startIdx; i < sections.length; i++) {
    const s = sections[i]!;
    headed.push({
      heading: displayHeading(s.heading),
      plain: s.plain.replace(/\u00a0/g, " ").trim(),
    });
  }
  return { preamblePlain, headed };
}

function matchedHeadingLabel(oldHeading: string, newHeading: string): string {
  if (oldHeading === newHeading) return newHeading;
  return `${newHeading} (was: ${oldHeading})`;
}

function buildDiffRow(
  index: number,
  headingLabel: string,
  prevPlain: string,
  nextPlain: string
): SectionDiffRow {
  const parts = diffWordsWithSpace(prevPlain, nextPlain);
  const stats = analyzeParts(parts);
  const hasChange =
    stats.addedWords > 0 ||
    stats.removedWords > 0 ||
    prevPlain !== nextPlain;
  return {
    index,
    headingLabel,
    parts,
    ...stats,
    hasChange,
  };
}

type HeadingPair = { oldIdx: number; newIdx: number; sim: number };

/**
 * Pair headed sections: exact normalized key (stable order within each key),
 * then greedy fuzzy match on remaining, then leftovers are added/removed only.
 */
function matchHeadedSections(
  oldSecs: HeadedBlock[],
  newSecs: HeadedBlock[]
): HeadingPair[] {
  const pairs: HeadingPair[] = [];
  const oldMatched = new Set<number>();
  const newMatched = new Set<number>();

  const oldByKey = new Map<string, number[]>();
  const newByKey = new Map<string, number[]>();

  for (let i = 0; i < oldSecs.length; i++) {
    const k = normalizeHeadingKey(oldSecs[i]!.heading);
    const list = oldByKey.get(k);
    if (list) list.push(i);
    else oldByKey.set(k, [i]);
  }
  for (let j = 0; j < newSecs.length; j++) {
    const k = normalizeHeadingKey(newSecs[j]!.heading);
    const list = newByKey.get(k);
    if (list) list.push(j);
    else newByKey.set(k, [j]);
  }

  for (const [k, oList] of oldByKey) {
    const nList = newByKey.get(k);
    if (!nList?.length) continue;
    const len = Math.min(oList.length, nList.length);
    for (let z = 0; z < len; z++) {
      const oi = oList[z]!;
      const ni = nList[z]!;
      pairs.push({ oldIdx: oi, newIdx: ni, sim: 1 });
      oldMatched.add(oi);
      newMatched.add(ni);
    }
  }

  const unmatchedOld = oldSecs
    .map((_, i) => i)
    .filter((i) => !oldMatched.has(i));
  const unmatchedNew = newSecs
    .map((_, j) => j)
    .filter((j) => !newMatched.has(j));

  type Cand = { oi: number; ni: number; sim: number };
  const cands: Cand[] = [];
  for (const oi of unmatchedOld) {
    for (const ni of unmatchedNew) {
      const sim = headingSimilarity(
        oldSecs[oi]!.heading,
        newSecs[ni]!.heading
      );
      if (sim >= HEADING_FUZZY_THRESHOLD) {
        cands.push({ oi, ni, sim });
      }
    }
  }
  cands.sort((a, b) => {
    if (b.sim !== a.sim) return b.sim - a.sim;
    if (a.oi !== b.oi) return a.oi - b.oi;
    return a.ni - b.ni;
  });

  for (const c of cands) {
    if (oldMatched.has(c.oi) || newMatched.has(c.ni)) continue;
    oldMatched.add(c.oi);
    newMatched.add(c.ni);
    pairs.push({ oldIdx: c.oi, newIdx: c.ni, sim: c.sim });
  }

  return pairs;
}

/**
 * Build diff rows: preamble compared as today; headed blocks matched by
 * heading (exact key then fuzzy), then new-only and old-only sections.
 */
export function buildSectionDiffRows(
  previousHtml: string,
  selectedHtml: string
): SectionDiffRow[] {
  const prev = buildContractSections(previousHtml);
  const next = buildContractSections(selectedHtml);

  const prevPh = extractPreambleAndHeaded(prev);
  const nextPh = extractPreambleAndHeaded(next);

  const emptyDoc =
    prevPh.headed.length === 0 &&
    nextPh.headed.length === 0 &&
    !prevPh.preamblePlain &&
    !nextPh.preamblePlain;

  if (emptyDoc) {
    const parts = diffWordsWithSpace("", "");
    const stats = analyzeParts(parts);
    return [
      {
        index: 0,
        headingLabel: "Document",
        parts,
        ...stats,
        hasChange: false,
      },
    ];
  }

  const pairs = matchHeadedSections(prevPh.headed, nextPh.headed);
  const oldToNew = new Map<number, number>();
  const newToOld = new Map<number, number>();
  for (const p of pairs) {
    oldToNew.set(p.oldIdx, p.newIdx);
    newToOld.set(p.newIdx, p.oldIdx);
  }

  const rows: SectionDiffRow[] = [];
  let rowIndex = 0;

  rows.push(
    buildDiffRow(
      rowIndex++,
      "Preamble (before first heading)",
      prevPh.preamblePlain,
      nextPh.preamblePlain
    )
  );

  for (let ni = 0; ni < nextPh.headed.length; ni++) {
    const newBlock = nextPh.headed[ni]!;
    const oi = newToOld.get(ni);
    if (oi !== undefined) {
      const oldBlock = prevPh.headed[oi]!;
      rows.push(
        buildDiffRow(
          rowIndex++,
          matchedHeadingLabel(oldBlock.heading, newBlock.heading),
          oldBlock.plain,
          newBlock.plain
        )
      );
    } else {
      rows.push(
        buildDiffRow(rowIndex++, newBlock.heading, "", newBlock.plain)
      );
    }
  }

  for (let oi = 0; oi < prevPh.headed.length; oi++) {
    if (oldToNew.has(oi)) continue;
    const oldBlock = prevPh.headed[oi]!;
    rows.push(
      buildDiffRow(
        rowIndex++,
        `${oldBlock.heading} (removed)`,
        oldBlock.plain,
        ""
      )
    );
  }

  return rows;
}

export function sumChangeTotals(rows: SectionDiffRow[]): {
  sectionsWithChanges: number;
  addedWords: number;
  removedWords: number;
  addedChars: number;
  removedChars: number;
} {
  return rows.reduce(
    (acc, r) => {
      if (!r.hasChange) return acc;
      return {
        sectionsWithChanges: acc.sectionsWithChanges + 1,
        addedWords: acc.addedWords + r.addedWords,
        removedWords: acc.removedWords + r.removedWords,
        addedChars: acc.addedChars + r.addedChars,
        removedChars: acc.removedChars + r.removedChars,
      };
    },
    {
      sectionsWithChanges: 0,
      addedWords: 0,
      removedWords: 0,
      addedChars: 0,
      removedChars: 0,
    }
  );
}

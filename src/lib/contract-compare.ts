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
  /**
   * HTML body for this section on the “new” side (`selectedHtml`): top-level nodes after each
   * h1–h3 until the next heading (preamble = nodes before the first h1–h3). Preserves TipTap markup.
   */
  newBodyHtml: string;
};

type HeadedBlock = { heading: string; plain: string };

/** Minimum heading similarity (0–1) to pair sections after exact key matches. */
const HEADING_FUZZY_THRESHOLD = 0.82;

const STRIKE_TAGS = new Set(["s", "strike", "del"]);

function getContractEditorTopLevelElementsFromWrap(wrap: HTMLElement): HTMLElement[] {
  let nodes = Array.from(wrap.children) as HTMLElement[];
  if (nodes.length === 1 && nodes[0]!.tagName.toLowerCase() === "div") {
    const inner = Array.from(nodes[0]!.children) as HTMLElement[];
    const looksLikeBlocks = inner.some((el) => {
      const t = el.tagName.toLowerCase();
      return (
        t === "p" ||
        t === "h1" ||
        t === "h2" ||
        t === "h3" ||
        t === "ul" ||
        t === "ol" ||
        t === "blockquote" ||
        t === "pre" ||
        t === "hr"
      );
    });
    if (looksLikeBlocks && inner.length > 0) {
      return inner;
    }
  }
  return nodes;
}

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

  const children = getContractEditorTopLevelElementsFromWrap(wrap);
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

type ContractSectionWithBody = ContractSection & { bodyHtml: string };

/**
 * Same section boundaries as {@link buildContractSections}, but each section also carries the
 * concatenated `outerHTML` of its non-heading top-level blocks (excludes h1–h3). Keeps diff row
 * `headingLabel` / `plain` aligned with `newBodyHtml` for proposal saves.
 */
function buildContractSectionsWithBodyHtml(html: string): ContractSectionWithBody[] {
  if (typeof document === "undefined") {
    return [];
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim() ? html : "";
  const sections: ContractSectionWithBody[] = [];
  type Current = {
    heading: string | null;
    plain: string;
    bodyParts: string[];
  };
  let current: Current | null = null;

  function pushCurrent() {
    if (!current) return;
    const plain = current.plain.replace(/\u00a0/g, " ").trim();
    if (!plain && current.heading === null) {
      current = null;
      return;
    }
    sections.push({
      heading: current.heading,
      plain,
      bodyHtml: current.bodyParts.join(""),
    });
    current = null;
  }

  const children = getContractEditorTopLevelElementsFromWrap(wrap);
  if (children.length === 0) {
    const t = plainTextExcludingStrike(wrap);
    if (t) {
      return [
        {
          heading: null,
          plain: t,
          bodyHtml: wrap.innerHTML.trim(),
        },
      ];
    }
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
        bodyParts: [],
      };
    } else {
      if (!current) {
        current = { heading: null, plain: "", bodyParts: [] };
      }
      current.bodyParts.push(el.outerHTML);
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

function extractPreambleHeadedWithBody(sections: ContractSectionWithBody[]): {
  preamblePlain: string;
  preambleHtml: string;
  headed: Array<{ heading: string; plain: string; bodyHtml: string }>;
} {
  if (sections.length === 0) {
    return { preamblePlain: "", preambleHtml: "", headed: [] };
  }
  let preamblePlain = "";
  let preambleHtml = "";
  let startIdx = 0;
  if (sections[0]!.heading === null) {
    preamblePlain = sections[0]!.plain.replace(/\u00a0/g, " ").trim();
    preambleHtml = sections[0]!.bodyHtml;
    startIdx = 1;
  }
  const headed: Array<{ heading: string; plain: string; bodyHtml: string }> = [];
  for (let i = startIdx; i < sections.length; i++) {
    const s = sections[i]!;
    headed.push({
      heading: displayHeading(s.heading),
      plain: s.plain.replace(/\u00a0/g, " ").trim(),
      bodyHtml: s.bodyHtml,
    });
  }
  return { preamblePlain, preambleHtml, headed };
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
  nextPlain: string,
  newBodyHtml: string
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
    newBodyHtml,
  };
}

/**
 * Split contract HTML like {@link buildContractSections}, but keep raw `outerHTML` for each
 * section body (excludes the heading elements themselves). Uses the same walk as
 * {@link buildContractSectionsWithBodyHtml} so slice indices cannot drift from section indices.
 */
export function extractContractSectionBodyHtmlSlices(html: string): {
  preambleHtml: string;
  headedBodyHtmls: string[];
} {
  if (typeof document === "undefined") {
    return { preambleHtml: "", headedBodyHtmls: [] };
  }
  const ex = extractPreambleHeadedWithBody(buildContractSectionsWithBodyHtml(html));
  return {
    preambleHtml: ex.preambleHtml,
    headedBodyHtmls: ex.headed.map((h) => h.bodyHtml),
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
  const nextSec = buildContractSectionsWithBodyHtml(selectedHtml);
  const nextEx = extractPreambleHeadedWithBody(nextSec);

  const prevPh = extractPreambleAndHeaded(prev);
  const nextPh: { preamblePlain: string; headed: HeadedBlock[] } = {
    preamblePlain: nextEx.preamblePlain,
    headed: nextEx.headed.map(({ heading, plain }) => ({ heading, plain })),
  };

  const emptyDoc =
    prevPh.headed.length === 0 &&
    nextPh.headed.length === 0 &&
    !prevPh.preamblePlain &&
    !nextPh.preamblePlain;

  if (emptyDoc) {
    const parts = diffWordsWithSpace("", "");
    const stats = analyzeParts(parts);
    const fallbackHtml =
      nextEx.preambleHtml ||
      nextEx.headed.map((h) => h.bodyHtml).join("") ||
      selectedHtml.trim();
    return [
      {
        index: 0,
        headingLabel: "Document",
        parts,
        ...stats,
        hasChange: false,
        newBodyHtml: fallbackHtml,
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
      nextPh.preamblePlain,
      nextEx.preambleHtml
    )
  );

  for (let ni = 0; ni < nextPh.headed.length; ni++) {
    const newBlock = nextPh.headed[ni]!;
    const bodyHtml = nextEx.headed[ni]!.bodyHtml;
    const oi = newToOld.get(ni);
    if (oi !== undefined) {
      const oldBlock = prevPh.headed[oi]!;
      rows.push(
        buildDiffRow(
          rowIndex++,
          matchedHeadingLabel(oldBlock.heading, newBlock.heading),
          oldBlock.plain,
          newBlock.plain,
          bodyHtml
        )
      );
    } else {
      rows.push(
        buildDiffRow(rowIndex++, newBlock.heading, "", newBlock.plain, bodyHtml)
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
        "",
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

/** Plain side of the diff (new document) from `diff` parts. */
function newSidePlainFromParts(parts: Change[]): string {
  let s = "";
  for (const p of parts) {
    if (!p.removed) s += p.value;
  }
  return s;
}

/**
 * Same visible plain as {@link buildContractSections} uses per top-level block,
 * joined with `\n\n` (must match `extractPreambleAndHeaded` / diff `nextPlain`).
 */
function sectionBodyPlainFromHtmlSliceRoot(root: HTMLElement): string {
  const children = getContractEditorTopLevelElementsFromWrap(root);
  if (children.length === 0) {
    return plainTextExcludingStrike(root).replace(/\u00a0/g, " ").trim();
  }
  let acc = "";
  for (const el of children) {
    const t = plainTextExcludingStrike(el);
    if (t) acc = acc ? `${acc}\n\n${t}` : t;
  }
  return acc.replace(/\u00a0/g, " ").trim();
}

function collapseWhitespaceTrimWithProv(
  str: string,
  prov: Array<{ node: Text; offset: number }>
): { plain: string; prov: Array<{ node: Text; offset: number }> } {
  const outCh: string[] = [];
  const outProv: Array<{ node: Text; offset: number }> = [];
  let i = 0;
  const n = str.length;
  while (i < n && /\s/.test(str[i]!)) i++;
  while (i < n) {
    if (/\s/.test(str[i]!)) {
      const wsStart = i;
      while (i < n && /\s/.test(str[i]!)) i++;
      outCh.push(" ");
      outProv.push(prov[wsStart]!);
      continue;
    }
    outCh.push(str[i]!);
    outProv.push(prov[i]!);
    i++;
  }
  while (outCh.length > 0 && outCh[outCh.length - 1] === " ") {
    outCh.pop();
    outProv.pop();
  }
  return { plain: outCh.join(""), prov: outProv };
}

function plainTextExcludingStrikeWithProv(el: HTMLElement): {
  plain: string;
  prov: Array<{ node: Text; offset: number }>;
} {
  let raw = "";
  const rawProv: Array<{ node: Text; offset: number }> = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const tn = node as Text;
      const s = tn.textContent ?? "";
      for (let k = 0; k < s.length; k++) {
        raw += s[k];
        rawProv.push({ node: tn, offset: k });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const elem = node as Element;
    if (STRIKE_TAGS.has(elem.tagName.toLowerCase())) return;
    for (const c of elem.childNodes) walk(c);
  }
  for (const c of el.childNodes) walk(c);
  const nb = raw.replace(/\u00a0/g, " ");
  return collapseWhitespaceTrimWithProv(nb, rawProv);
}

function trimPlainAndProv(
  plain: string,
  prov: Array<{ node: Text | null; offset: number }>
): { plain: string; prov: Array<{ node: Text | null; offset: number }> } {
  let s = 0;
  let e = plain.length;
  while (s < e && /\s/.test(plain[s]!)) s++;
  while (e > s && /\s/.test(plain[e - 1]!)) e--;
  return { plain: plain.slice(s, e), prov: prov.slice(s, e) };
}

/**
 * Character-level map from section body HTML to text nodes (null = logical `\n\n` between blocks).
 * Built from the same DOM root that will be mutated for wrapping.
 */
function sectionBodyPlainWithProvenanceFromRoot(root: HTMLElement): {
  plain: string;
  prov: Array<{ node: Text | null; offset: number }>;
} {
  const children = getContractEditorTopLevelElementsFromWrap(root);
  if (children.length === 0) {
    const r = plainTextExcludingStrikeWithProv(root);
    return trimPlainAndProv(
      r.plain.replace(/\u00a0/g, " "),
      r.prov.map((p) => ({ node: p.node, offset: p.offset }))
    );
  }
  let fullPlain = "";
  let fullProv: Array<{ node: Text | null; offset: number }> = [];
  let hasBlock = false;
  for (const el of children) {
    const t = plainTextExcludingStrike(el);
    if (!t) continue;
    const r = plainTextExcludingStrikeWithProv(el as HTMLElement);
    if (hasBlock) {
      fullPlain += "\n\n";
      fullProv.push({ node: null, offset: 0 }, { node: null, offset: 0 });
    }
    fullPlain += r.plain;
    for (const p of r.prov) {
      fullProv.push({ node: p.node, offset: p.offset });
    }
    hasBlock = true;
  }
  return trimPlainAndProv(
    fullPlain.replace(/\u00a0/g, " "),
    fullProv
  );
}

/**
 * Apply several non-overlapping [start,end) wraps on one text node in a single replace.
 * Needed when multiple diff-added ranges map to the same node: repeated replaceChild would
 * detach the node after the first wrap and leave later ops stale.
 */
function wrapMultipleSegmentsOnTextNode(
  textNode: Text,
  segments: { start: number; end: number }[]
): void {
  const doc = textNode.ownerDocument;
  const parent = textNode.parentNode;
  if (!doc || !parent || segments.length === 0) return;
  const full = textNode.textContent ?? "";
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const s of sorted) {
    if (s.end <= s.start) continue;
    if (s.start < 0 || s.end > full.length) continue;
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ start: s.start, end: s.end });
    }
  }
  if (merged.length === 0) return;
  const frag = doc.createDocumentFragment();
  let pos = 0;
  for (const seg of merged) {
    if (pos < seg.start) {
      frag.appendChild(doc.createTextNode(full.slice(pos, seg.start)));
    }
    const strong = doc.createElement("strong");
    strong.appendChild(doc.createTextNode(full.slice(seg.start, seg.end)));
    frag.appendChild(strong);
    pos = seg.end;
  }
  if (pos < full.length) {
    frag.appendChild(doc.createTextNode(full.slice(pos)));
  }
  parent.replaceChild(frag, textNode);
}

function addedRangesToWrapOps(
  ranges: [number, number][],
  prov: Array<{ node: Text | null; offset: number }>
): { node: Text; start: number; end: number }[] {
  const ops: { node: Text; start: number; end: number }[] = [];
  for (const [a0, b0] of ranges) {
    let i = a0;
    while (i < b0) {
      while (i < b0 && prov[i]?.node == null) i++;
      if (i >= b0) break;
      const n = prov[i]!.node!;
      const startOff = prov[i]!.offset;
      let lastOff = startOff;
      i++;
      while (
        i < b0 &&
        prov[i]?.node === n &&
        prov[i]!.offset === lastOff + 1
      ) {
        lastOff = prov[i]!.offset;
        i++;
      }
      ops.push({ node: n, start: startOff, end: lastOff + 1 });
    }
  }
  return ops;
}

function compareTextNodesDocumentOrder(a: Text, b: Text): number {
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * For contract-compare proposal saves: wrap diff-added runs in `<strong>` using sequential
 * alignment between `parts` and visible plain text (strike skipped). Falls back to the
 * original HTML if alignment fails.
 */
export function wrapDiffAdditionsInProposalBodyHtml(
  bodyHtml: string,
  parts: Change[]
): string {
  if (typeof document === "undefined") return bodyHtml;
  const trimmed = bodyHtml.trim();
  if (!trimmed) return bodyHtml;
  if (!parts.some((p) => p.added)) return bodyHtml;

  const reconstructed = newSidePlainFromParts(parts);
  const root = document.createElement("div");
  root.innerHTML = trimmed;

  const domPlainCheck = sectionBodyPlainFromHtmlSliceRoot(root);
  if (domPlainCheck !== reconstructed) return bodyHtml;

  const { plain, prov } = sectionBodyPlainWithProvenanceFromRoot(root);
  if (plain !== reconstructed) return bodyHtml;
  if (plain.length !== prov.length) return bodyHtml;

  let pos = 0;
  for (const p of parts) {
    if (p.removed) continue;
    const L = p.value.length;
    if (plain.slice(pos, pos + L) !== p.value) return bodyHtml;
    pos += L;
  }
  if (pos !== plain.length) return bodyHtml;

  const addedRangesRaw: [number, number][] = [];
  pos = 0;
  for (const p of parts) {
    if (p.removed) continue;
    const L = p.value.length;
    if (p.added) addedRangesRaw.push([pos, pos + L]);
    pos += L;
  }

  const addedRanges: [number, number][] = [];
  for (const [a0, b0] of addedRangesRaw) {
    let s = a0;
    let e = b0;
    while (s < e && /\s/.test(plain[s]!)) s++;
    while (e > s && /\s/.test(plain[e - 1]!)) e--;
    if (e > s) addedRanges.push([s, e]);
  }

  const ops = addedRangesToWrapOps(addedRanges, prov);
  const byNode = new Map<Text, { start: number; end: number }[]>();
  for (const op of ops) {
    const list = byNode.get(op.node);
    if (list) list.push({ start: op.start, end: op.end });
    else byNode.set(op.node, [{ start: op.start, end: op.end }]);
  }
  const nodes = [...byNode.keys()].sort(compareTextNodesDocumentOrder);
  for (const node of nodes) {
    wrapMultipleSegmentsOnTextNode(node, byNode.get(node)!);
  }

  return root.innerHTML;
}

/**
 * Read-only agreement navigation: headings for outline, DOM highlight for find-in-page.
 * Master HTML is trusted (internal uploads); still only touches text nodes.
 */

export type AgreementHeadingItem = {
  index: number;
  level: number;
  text: string;
};

export function extractAgreementHeadings(html: string): AgreementHeadingItem[] {
  if (typeof document === "undefined" || !html.trim()) return [];
  const d = document.createElement("div");
  d.innerHTML = html;
  const heads = d.querySelectorAll("h1, h2, h3");
  return Array.from(heads).map((el, index) => ({
    index,
    level: Number(el.tagName[1]),
    text: el.textContent?.trim() || `Section ${index + 1}`,
  }));
}

export function scrollToAgreementHeading(
  root: HTMLElement | null,
  headingIndex: number
): void {
  if (!root) return;
  const heads = root.querySelectorAll("h1, h2, h3");
  const el = heads.item(headingIndex) as HTMLElement | null;
  el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const HIT_CLASS = "agreement-search-hit";

/**
 * Wraps each case-insensitive match in text nodes with <mark>. Returns cleanup to remove marks.
 * Re-run when HTML or query changes; call cleanup before applying again.
 */
export function highlightAgreementMatches(
  root: HTMLElement | null,
  rawQuery: string
): () => void {
  if (!root) return () => {};

  const query = rawQuery.trim();
  if (query.length < 2) return () => {};

  const lowerQ = query.toLowerCase();
  const qLen = query.length;

  const marks: HTMLElement[] = [];

  let safety = 0;
  const maxIterations = 10000;

  while (safety < maxIterations) {
    safety += 1;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let foundNode: Text | null = null;
    let foundIdx = -1;

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = node as Text;
      if (!t.textContent || !t.parentElement) continue;
      if (t.parentElement.closest(`mark.${HIT_CLASS}`)) continue;

      const text = t.textContent;
      const idx = text.toLowerCase().indexOf(lowerQ);
      if (idx !== -1) {
        foundNode = t;
        foundIdx = idx;
        break;
      }
    }

    if (!foundNode || foundIdx < 0) break;

    const range = document.createRange();
    range.setStart(foundNode, foundIdx);
    range.setEnd(foundNode, foundIdx + qLen);
    const mark = document.createElement("mark");
    mark.className = `${HIT_CLASS} bg-amber-200/85 rounded px-0.5 ring-1 ring-amber-400/40`;
    try {
      range.surroundContents(mark);
      marks.push(mark);
    } catch {
      break;
    }
  }

  return () => {
    for (const mark of [...marks].reverse()) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  };
}

export function countAgreementMatches(html: string, rawQuery: string): number {
  const query = rawQuery.trim();
  if (query.length < 2) return 0;
  if (typeof document === "undefined") return 0;
  const d = document.createElement("div");
  d.innerHTML = html;
  const lowerQ = query.toLowerCase();
  let count = 0;
  const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = (node as Text).textContent ?? "";
    let pos = 0;
    const lower = t.toLowerCase();
    while ((pos = lower.indexOf(lowerQ, pos)) !== -1) {
      count += 1;
      pos += query.length;
    }
  }
  return count;
}

import { JSDOM } from "jsdom";

function isEmptyBlock(el: Element): boolean {
  const html = el.innerHTML.replace(/\s|&nbsp;/g, "").trim();
  if (!html) return true;
  return /^<br\s*\/?>$/i.test(html.trim());
}

/**
 * Deterministic cleanup: empty paragraphs, optional tbody, unwrap redundant spans.
 * Does not change heading tag names or levels.
 */
export function normalizeContractHtml(html: string): {
  html: string;
  emptyParagraphsRemoved: number;
} {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const body = document.body;

  let emptyParagraphsRemoved = 0;

  const removeEmptyPs = (root: Element) => {
    const ps = root.querySelectorAll("p");
    for (const p of Array.from(ps)) {
      if (isEmptyBlock(p)) {
        p.remove();
        emptyParagraphsRemoved += 1;
      }
    }
  };

  removeEmptyPs(body);

  const unwrapRedundantSpans = (root: Element) => {
    const spans = root.querySelectorAll("span");
    for (const span of Array.from(spans)) {
      if (!span.parentNode) continue;
      if (span.attributes.length > 0) continue;
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  };

  unwrapRedundantSpans(body);

  const ensureTbody = (root: Element) => {
    for (const table of Array.from(root.querySelectorAll("table"))) {
      const directTr = Array.from(table.children).filter(
        (c) => c.tagName === "TR"
      );
      if (directTr.length > 0) {
        const tbody = document.createElement("tbody");
        for (const tr of directTr) {
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
      }
    }
  };

  ensureTbody(body);

  return { html: body.innerHTML, emptyParagraphsRemoved };
}

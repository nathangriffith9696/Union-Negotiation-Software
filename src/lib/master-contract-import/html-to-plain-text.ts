import { JSDOM } from "jsdom";

/**
 * Plain text for `body_text`: block-ish units separated by blank lines.
 */
export function htmlToPlainText(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.body;
  const out: string[] = [];

  const block = (el: Element) => {
    const t = (el.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (t) out.push(t);
  };

  const walk = (parent: Element) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      const tag = el.tagName;
      if (tag === "TABLE") {
        for (const tr of Array.from(
          el.querySelectorAll(
            ":scope > thead > tr, :scope > tbody > tr, :scope > tr"
          )
        )) {
          const cells = Array.from(tr.querySelectorAll("th, td"))
            .map((c) =>
              (c.textContent ?? "").replace(/\s+/g, " ").trim()
            )
            .filter(Boolean);
          if (cells.length) out.push(cells.join(" | "));
        }
        continue;
      }
      if (/^(P|H[1-6]|BLOCKQUOTE)$/.test(tag)) {
        block(el);
        continue;
      }
      if (tag === "UL" || tag === "OL") {
        for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
          block(li);
        }
        continue;
      }
      walk(el);
    }
  };

  walk(body);
  return out.join("\n\n");
}

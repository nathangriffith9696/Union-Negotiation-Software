import { JSDOM } from "jsdom";

/** Allowed tags for master contract HTML (TipTap-compatible subset). */
const ALLOWED_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "strike",
  "sub",
  "sup",
  "br",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
  "span",
]);

const URI_ATTR = new Set(["href", "src", "cite"]);

function isSafeHref(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("#");
}

/**
 * Strip scripts, disallowed tags, and dangerous attributes. Does not change heading levels.
 */
export function sanitizeContractHtml(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const body = document.body;

  const stripDangerous = (root: Element) => {
    const all = root.querySelectorAll("*");
    for (const el of Array.from(all)) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === "style" || name === "class") {
          el.removeAttribute(attr.name);
          continue;
        }
        if (URI_ATTR.has(name)) {
          if (name === "href" && el.tagName.toLowerCase() === "a") {
            if (!isSafeHref(attr.value)) {
              el.removeAttribute(attr.name);
            }
          } else {
            el.removeAttribute(attr.name);
          }
        }
      }
    }
  };

  stripDangerous(body);

  const unwrapDisallowed = (root: Element) => {
    let again = true;
    while (again) {
      again = false;
      const els = root.querySelectorAll("*");
      for (const el of Array.from(els)) {
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          const parent = el.parentNode;
          if (!parent) continue;
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
          again = true;
        }
      }
    }
  };

  unwrapDisallowed(body);

  return body.innerHTML;
}

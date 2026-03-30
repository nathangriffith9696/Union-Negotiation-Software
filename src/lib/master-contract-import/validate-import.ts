import { JSDOM } from "jsdom";
import type {
  ImportValidationIssue,
  ImportValidationResult,
  ImportValidationStats,
} from "./types";

/** Document order: depth-first, only heading elements. */
function collectHeadingsInOrder(body: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (el: Element) => {
    if (/^H[1-6]$/.test(el.tagName)) {
      out.push(el as HTMLElement);
      return;
    }
    for (const c of Array.from(el.children)) {
      walk(c);
    }
  };
  walk(body);
  return out;
}

export function extractImportStats(html: string): ImportValidationStats {
  const dom = new JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.body;
  const heads = body.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  let h4p = 0;
  for (const h of Array.from(heads)) {
    const n = Number(h.tagName[1]);
    if (n === 1) h1 += 1;
    else if (n === 2) h2 += 1;
    else if (n === 3) h3 += 1;
    else h4p += 1;
  }
  return {
    headingH1: h1,
    headingH2: h2,
    headingH3: h3,
    headingH4Plus: h4p,
    paragraphCount: body.querySelectorAll("p").length,
    tableCount: body.querySelectorAll("table").length,
    unorderedListCount: body.querySelectorAll("ul").length,
    orderedListCount: body.querySelectorAll("ol").length,
    listItemCount: body.querySelectorAll("li").length,
    emptyParagraphsRemoved: 0,
  };
}

function validateHeadingSequence(headings: HTMLElement[]): ImportValidationIssue[] {
  const errors: ImportValidationIssue[] = [];
  let prev: number | null = null;

  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (level >= 4) {
      errors.push({
        code: "UNSUPPORTED_HEADING_LEVEL",
        message:
          "Heading 4–6 are not supported in strict import. Use Word Heading 1–3 only.",
        detail: h.textContent?.slice(0, 80),
      });
      continue;
    }

    if (prev === null) {
      if (level !== 1) {
        errors.push({
          code: "FIRST_HEADING_NOT_ARTICLE",
          message:
            "The first heading in the document must be Heading 1 (article).",
        });
      }
      prev = level;
      continue;
    }

    if (level > prev && level > prev + 1) {
      errors.push({
        code: "SKIPPED_HEADING_LEVEL",
        message:
          "Skipped a heading level (e.g. article → subsection with no section). Fix Word Heading 1–3 structure.",
        detail: h.textContent?.slice(0, 80),
      });
    }
    prev = level;
  }

  return errors;
}

function validateTables(html: string): ImportValidationIssue[] {
  const warnings: ImportValidationIssue[] = [];
  const dom = new JSDOM(`<body>${html}</body>`);
  const tables = dom.window.document.body.querySelectorAll("table");
  for (const table of Array.from(tables)) {
    const rows = table.querySelectorAll("tr");
    if (rows.length === 0) {
      warnings.push({
        code: "TABLE_NO_ROWS",
        message: "A table has no rows.",
      });
      continue;
    }
    const colCounts = Array.from(rows).map(
      (tr) => tr.querySelectorAll("th, td").length
    );
    const first = colCounts[0] ?? 0;
    if (first > 0 && colCounts.some((c) => c !== first)) {
      warnings.push({
        code: "TABLE_RAGGED_COLUMNS",
        message:
          "A table has uneven row lengths (merged cells or layout issues). Review the table in Word.",
      });
    }
  }
  return warnings;
}

export function validateContractImport(
  normalizedHtml: string,
  bodyText: string,
  stats: ImportValidationStats
): ImportValidationResult {
  const errors: ImportValidationIssue[] = [];
  const warnings: ImportValidationIssue[] = [];

  if (!bodyText.trim()) {
    errors.push({
      code: "EMPTY_BODY",
      message: "The document has no extractable text after import.",
    });
  }

  const dom = new JSDOM(`<body>${normalizedHtml}</body>`);
  const body = dom.window.document.body;
  const headings = collectHeadingsInOrder(body);

  if (headings.length === 0) {
    errors.push({
      code: "NO_HEADINGS",
      message:
        "No headings found. Use Word Heading 1 (article), 2 (section), 3 (subsection).",
    });
  }

  errors.push(...validateHeadingSequence(headings));

  warnings.push(...validateTables(normalizedHtml));

  const ok = errors.length === 0;
  return {
    ok,
    mode: "strict",
    errors,
    warnings,
    stats,
    converterNotes: [],
  };
}

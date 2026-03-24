import { diffWordsWithSpace } from "diff";
import type { Change } from "diff";
import { describe, expect, it } from "vitest";
import {
  buildSectionDiffRows,
  wrapDiffAdditionsInProposalBodyHtml,
} from "./contract-compare";

/** Full contract doc: preamble optional, then h2 + p per section (matches contract-compare tests). */
function contractDoc(
  sections: Array<{ heading: string; bodyHtml: string }>
): string {
  return sections
    .map((s) => `<h2>${s.heading}</h2>${s.bodyHtml}`)
    .join("");
}

function wrapArticleRow(prev: string, next: string, headingSub: string) {
  const rows = buildSectionDiffRows(prev, next);
  const row = rows.find((r) => r.headingLabel.includes(headingSub));
  expect(row).toBeDefined();
  return wrapDiffAdditionsInProposalBodyHtml(row!.newBodyHtml, row!.parts);
}

describe("wrapDiffAdditionsInProposalBodyHtml", () => {
  it("wraps a simple inserted word", () => {
    const prev = contractDoc([{ heading: "Article 1", bodyHtml: "<p>alpha beta</p>" }]);
    const next = contractDoc([
      { heading: "Article 1", bodyHtml: "<p>alpha new beta</p>" },
    ]);
    const out = wrapArticleRow(prev, next, "Article 1");
    expect(out).toContain("<strong>new</strong>");
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
  });

  it("handles repeated phrases (diff may merge additions; both tokens end up bolded)", () => {
    const prev = contractDoc([
      { heading: "Article 1", bodyHtml: "<p>alpha beta alpha</p>" },
    ]);
    const next = contractDoc([
      {
        heading: "Article 1",
        bodyHtml: "<p>alpha X beta alpha X</p>",
      },
    ]);
    const out = wrapArticleRow(prev, next, "Article 1");
    expect((out.match(/X/g) ?? []).length).toBe(2);
    expect(out).toContain("<strong>");
    expect(out.replace(/<[^>]+>/g, "")).toMatch(/X[\s\S]*beta[\s\S]*X/);
  });

  it("preserves existing bold and italic; wraps diff-added span (may include multiple words)", () => {
    const prev = contractDoc([
      {
        heading: "Article 1",
        bodyHtml: "<p>start <strong>bold</strong> <em>em</em> end</p>",
      },
    ]);
    const next = contractDoc([
      {
        heading: "Article 1",
        bodyHtml:
          "<p>start <strong>bold</strong> <em>em</em> middle NEW end</p>",
      },
    ]);
    const out = wrapArticleRow(prev, next, "Article 1");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>em</em>");
    expect(out).toMatch(/<strong>middle NEW<\/strong>/);
  });

  it("wraps additions in list items", () => {
    const prev = contractDoc([
      {
        heading: "Article 1",
        bodyHtml: "<ul><li>one</li><li>two</li></ul>",
      },
    ]);
    const next = contractDoc([
      {
        heading: "Article 1",
        bodyHtml: "<ul><li>one</li><li>two extra</li></ul>",
      },
    ]);
    const out = wrapArticleRow(prev, next, "Article 1");
    expect(out).toContain("<strong>extra</strong>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
  });

  it("keeps strike for deleted language and bolds insertion after strike", () => {
    const prev = contractDoc([
      { heading: "Article 1", bodyHtml: "<p>old text keep</p>" },
    ]);
    const next = contractDoc([
      {
        heading: "Article 1",
        bodyHtml: "<p><s>old text</s> keep ADDED</p>",
      },
    ]);
    const out = wrapArticleRow(prev, next, "Article 1");
    expect(out).toContain("<s>");
    expect(out).toContain("old text");
    expect(out).toMatch(/<strong>ADDED<\/strong>/);
  });

  it("handles extra whitespace in HTML that collapses to diff plain", () => {
    const prev = contractDoc([
      { heading: "Article 1", bodyHtml: "<p>a    b</p>" },
    ]);
    const next = contractDoc([
      { heading: "Article 1", bodyHtml: "<p>a  x   b</p>" },
    ]);
    const out = wrapArticleRow(prev, next, "Article 1");
    expect(out).toMatch(/<strong>\s*x\s*<\/strong>/);
  });

  it("returns original HTML when diff parts do not align with DOM plain", () => {
    const html = "<p>unchanged</p>";
    const bogus = diffWordsWithSpace("aaa", "bbb");
    const out = wrapDiffAdditionsInProposalBodyHtml(html, bogus);
    expect(out).toBe(html);
  });

  it("returns original HTML when parts claim added text that is not in order", () => {
    const html = "<p>abc</p>";
    const parts: Change[] = [
      { value: "a", added: false, removed: false },
      { value: "z", added: true, removed: false },
      { value: "bc", added: false, removed: false },
    ];
    const out = wrapDiffAdditionsInProposalBodyHtml(html, parts);
    expect(out).toBe(html);
  });

  it("no-ops when there are no added segments", () => {
    const prev = contractDoc([{ heading: "A", bodyHtml: "<p>same</p>" }]);
    const next = contractDoc([{ heading: "A", bodyHtml: "<p>same</p>" }]);
    const rows = buildSectionDiffRows(prev, next);
    const row = rows.find((r) => r.headingLabel.includes("A"))!;
    const raw = row.newBodyHtml;
    expect(wrapDiffAdditionsInProposalBodyHtml(raw, row.parts)).toBe(raw);
  });
});

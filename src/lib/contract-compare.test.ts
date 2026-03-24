import { describe, expect, it } from "vitest";
import {
  buildContractSections,
  buildSectionDiffRows,
  sumChangeTotals,
} from "./contract-compare";

/**
 * Build TipTap-like HTML: optional preamble paragraph, then h2 + p pairs.
 */
function contractHtml(
  preamble: string | undefined,
  sections: Array<{ heading: string; body: string }>
): string {
  const pre =
    preamble !== undefined && preamble !== ""
      ? `<p>${preamble}</p>`
      : "";
  const blocks = sections
    .map(
      (s) => `<h2>${s.heading}</h2><p>${s.body}</p>`
    )
    .join("");
  return pre + blocks;
}

function labels(rows: ReturnType<typeof buildSectionDiffRows>) {
  return rows.map((r) => r.headingLabel);
}

describe("buildContractSections", () => {
  it("treats leading paragraphs as preamble before first heading", () => {
    const html = contractHtml("Intro only", []);
    const sections = buildContractSections(html);
    expect(sections).toEqual([{ heading: null, plain: "Intro only" }]);
  });
});

describe("buildSectionDiffRows", () => {
  it("matches sections with the same heading text even when order changes", () => {
    const prev = contractHtml(undefined, [
      { heading: "Article A", body: "alpha body" },
      { heading: "Article B", body: "beta body" },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Article B", body: "beta body changed" },
      { heading: "Article A", body: "alpha body" },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(labels(rows)).toEqual([
      "Preamble (before first heading)",
      "Article B",
      "Article A",
    ]);
    const b = rows.find((r) => r.headingLabel === "Article B")!;
    const a = rows.find((r) => r.headingLabel === "Article A")!;
    expect(b.hasChange).toBe(true);
    expect(a.hasChange).toBe(false);
  });

  it("pairs headings that match exactly after normalization (case / punctuation)", () => {
    const prev = contractHtml(undefined, [
      { heading: "Article 5 — Wages", body: "Same text." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "article 5 wages", body: "Same text." },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(labels(rows)).toEqual([
      "Preamble (before first heading)",
      "article 5 wages (was: Article 5 — Wages)",
    ]);
    const sectionRow = rows[1]!;
    expect(sectionRow.hasChange).toBe(false);
  });

  it("fuzzy-matches headings that are similar but not identical after normalization", () => {
    const prev = contractHtml(undefined, [
      { heading: "Retroactivity Clause", body: "The union proposes retro pay." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Retroactivity Clase", body: "The union proposes retro pay." },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(labels(rows)).toEqual([
      "Preamble (before first heading)",
      "Retroactivity Clase (was: Retroactivity Clause)",
    ]);
    expect(rows[1]!.hasChange).toBe(false);
  });

  it("treats a heading that exists only in the new version as an added section", () => {
    const prev = contractHtml(undefined, [
      { heading: "Article A", body: "unchanged" },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Article A", body: "unchanged" },
      { heading: "Article B — New", body: "Entirely new section body." },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(labels(rows)).toContain("Article B — New");
    const added = rows.find((r) => r.headingLabel === "Article B — New")!;
    expect(added.hasChange).toBe(true);
    expect(added.addedWords).toBeGreaterThan(0);
    expect(added.removedWords).toBe(0);
    const onlyAdded = added.parts.every(
      (p) => !p.removed && (p.added || (!p.added && !p.removed))
    );
    expect(onlyAdded).toBe(true);
    expect(added.parts.some((p) => p.added)).toBe(true);
  });

  it("attaches newBodyHtml from the new side preserving rich markup", () => {
    const prev = contractHtml(undefined, [
      { heading: "Article A", body: "alpha" },
    ]);
    const next =
      "<h2>Article A</h2><p>alpha <strong>bold</strong> change</p>";
    const rows = buildSectionDiffRows(prev, next);
    const row = rows.find((r) => r.headingLabel === "Article A")!;
    expect(row.newBodyHtml).toContain("<strong>");
    expect(row.newBodyHtml).toContain("bold");
  });

  it("unwraps a single wrapper div when slicing section body HTML", () => {
    const prev = contractHtml(undefined, [{ heading: "A", body: "old" }]);
    const next = "<div><h2>A</h2><p>new <em>x</em></p></div>";
    const rows = buildSectionDiffRows(prev, next);
    const row = rows.find((r) => r.headingLabel === "A")!;
    expect(row.newBodyHtml).toBe("<p>new <em>x</em></p>");
  });

  it("treats a heading that exists only in the old version as removed", () => {
    const prev = contractHtml(undefined, [
      { heading: "Article A", body: "stays" },
      { heading: "Sunset Article", body: "This section is deleted later." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Article A", body: "stays" },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(labels(rows)).toEqual([
      "Preamble (before first heading)",
      "Article A",
      "Sunset Article (removed)",
    ]);
    const removed = rows.find((r) =>
      r.headingLabel.includes("Sunset Article (removed)")
    )!;
    expect(removed.hasChange).toBe(true);
    expect(removed.removedWords).toBeGreaterThan(0);
    expect(removed.addedWords).toBe(0);
    expect(removed.parts.some((p) => p.removed)).toBe(true);
  });

  it("compares preamble before the first heading independently of headed sections", () => {
    const prev = contractHtml("Old preamble text.", [
      { heading: "Article I", body: "Section body unchanged." },
    ]);
    const next = contractHtml("New preamble text.", [
      { heading: "Article I", body: "Section body unchanged." },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(rows[0]!.headingLabel).toBe("Preamble (before first heading)");
    expect(rows[0]!.hasChange).toBe(true);
    expect(rows[1]!.headingLabel).toBe("Article I");
    expect(rows[1]!.hasChange).toBe(false);
  });

  it("matches duplicate identical headings in document order within each version", () => {
    const prev = contractHtml(undefined, [
      { heading: "Exhibit A", body: "first block" },
      { heading: "Exhibit A", body: "second block" },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Exhibit A", body: "first block edited" },
      { heading: "Exhibit A", body: "second block" },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    const exhibitRows = rows.filter((r) => r.headingLabel === "Exhibit A");
    expect(exhibitRows).toHaveLength(2);
    expect(exhibitRows[0]!.hasChange).toBe(true);
    expect(exhibitRows[1]!.hasChange).toBe(false);
  });

  it("returns a single inert row for two completely empty documents", () => {
    const rows = buildSectionDiffRows("", "");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.headingLabel).toBe("Document");
    expect(rows[0]!.hasChange).toBe(false);
  });

  it("does not pair unrelated headings as fuzzy matches below the threshold", () => {
    const prev = contractHtml(undefined, [
      { heading: "Grievance Procedure", body: "Step one." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Management Rights", body: "Different topic." },
    ]);
    const rows = buildSectionDiffRows(prev, next);
    expect(labels(rows)).toEqual([
      "Preamble (before first heading)",
      "Management Rights",
      "Grievance Procedure (removed)",
    ]);
  });

  it("treats manual <s> markup as removed language vs an unstuck prior version", () => {
    const prev = contractHtml(undefined, [
      { heading: "Wages", body: "Pay is weekly on Friday." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Wages", body: "Pay is <s>weekly</s> on Friday." },
    ]);
    const row = buildSectionDiffRows(prev, next).find(
      (r) => r.headingLabel === "Wages"
    )!;
    expect(row.removedWords).toBeGreaterThan(0);
    expect(row.addedWords).toBe(0);
    expect(
      row.parts.some((p) => p.removed && /weekly/i.test(p.value))
    ).toBe(true);
  });

  it("matches identical body when the same text is struck in both versions", () => {
    const body = "Pay is <s>weekly</s> on Friday.";
    const prev = contractHtml(undefined, [{ heading: "Wages", body }]);
    const next = contractHtml(undefined, [{ heading: "Wages", body }]);
    const row = buildSectionDiffRows(prev, next).find(
      (r) => r.headingLabel === "Wages"
    )!;
    expect(row.hasChange).toBe(false);
  });

  it("treats <del> like strike for comparison", () => {
    const prev = contractHtml(undefined, [
      { heading: "Hours", body: "Keep remove keep." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Hours", body: "Keep <del>remove</del> keep." },
    ]);
    const row = buildSectionDiffRows(prev, next).find(
      (r) => r.headingLabel === "Hours"
    )!;
    expect(row.removedWords).toBeGreaterThan(0);
  });

  it("treats clearing strike markup as added language", () => {
    const prev = contractHtml(undefined, [
      { heading: "Wages", body: "Pay is <s>weekly</s> on Friday." },
    ]);
    const next = contractHtml(undefined, [
      { heading: "Wages", body: "Pay is weekly on Friday." },
    ]);
    const row = buildSectionDiffRows(prev, next).find(
      (r) => r.headingLabel === "Wages"
    )!;
    expect(row.addedWords).toBeGreaterThan(0);
    expect(
      row.parts.some((p) => p.added && /weekly/i.test(p.value))
    ).toBe(true);
  });
});

describe("sumChangeTotals", () => {
  it("aggregates only rows with hasChange", () => {
    const prev = contractHtml("a", [{ heading: "H", body: "x" }]);
    const next = contractHtml("b", [{ heading: "H", body: "x" }]);
    const rows = buildSectionDiffRows(prev, next);
    const totals = sumChangeTotals(rows);
    expect(totals.sectionsWithChanges).toBe(1);
    expect(totals.addedWords + totals.removedWords).toBeGreaterThan(0);
  });
});

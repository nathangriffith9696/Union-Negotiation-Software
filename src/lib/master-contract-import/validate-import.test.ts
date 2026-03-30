import { describe, expect, it } from "vitest";
import { validateContractImport } from "./validate-import";
import type { ImportValidationStats } from "./types";

const baseStats = (): ImportValidationStats => ({
  headingH1: 0,
  headingH2: 0,
  headingH3: 0,
  headingH4Plus: 0,
  paragraphCount: 0,
  tableCount: 0,
  unorderedListCount: 0,
  orderedListCount: 0,
  listItemCount: 0,
  emptyParagraphsRemoved: 0,
});

describe("validateContractImport", () => {
  it("passes for h1 → h2 → h3", () => {
    const html =
      "<h1>Article I</h1><p>x</p><h2>Sec A</h2><h3>1.01</h3>";
    const r = validateContractImport(html, "Article I\n\nx\n\nSec A\n\n1.01", {
      ...baseStats(),
      headingH1: 1,
      headingH2: 1,
      headingH3: 1,
      paragraphCount: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("fails when first heading is not h1", () => {
    const html = "<h2>Bad</h2>";
    const r = validateContractImport(html, "Bad", {
      ...baseStats(),
      headingH2: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "FIRST_HEADING_NOT_ARTICLE")).toBe(
      true
    );
  });

  it("fails on h1 → h3 skip", () => {
    const html = "<h1>A</h1><h3>Sub</h3>";
    const r = validateContractImport(html, "A\n\nSub", {
      ...baseStats(),
      headingH1: 1,
      headingH3: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "SKIPPED_HEADING_LEVEL")).toBe(true);
  });

  it("fails on h4", () => {
    const html = "<h1>A</h1><h4>Nope</h4>";
    const r = validateContractImport(html, "A\n\nNope", {
      ...baseStats(),
      headingH1: 1,
      headingH4Plus: 1,
    });
    expect(r.ok).toBe(false);
    expect(
      r.errors.some((e) => e.code === "UNSUPPORTED_HEADING_LEVEL")
    ).toBe(true);
  });
});

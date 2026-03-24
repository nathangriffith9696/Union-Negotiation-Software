import { describe, expect, it } from "vitest";
import {
  proposalArticleSortKey,
  type ProposalsPrintRow,
} from "./ProposalsPrintDocument";

function sortTitles(titles: string[]): string[] {
  const rows: ProposalsPrintRow[] = titles.map((title, i) => ({
    id: `id-${i}`,
    title,
    category: "general",
    status: "draft",
    summary: null,
    bodyHtml: null,
    proposingParty: "union",
    negotiationTitle: "N",
    bargainingUnitName: "BU",
    localName: "L",
    districtName: "D",
  }));
  rows.sort((a, b) => {
    const ka = proposalArticleSortKey(a.title);
    const kb = proposalArticleSortKey(b.title);
    const oa =
      ka.bucket === "preamble" ? 0 : ka.bucket === "article" ? 1 : 2;
    const ob =
      kb.bucket === "preamble" ? 0 : kb.bucket === "article" ? 1 : 2;
    if (oa !== ob) return oa - ob;
    if (ka.bucket === "article" && kb.bucket === "article") {
      return (ka.articleNumber ?? 0) - (kb.articleNumber ?? 0);
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  return rows.map((r) => r.title);
}

describe("proposalArticleSortKey", () => {
  it("detects numbered articles case-insensitively", () => {
    expect(proposalArticleSortKey("ARTICLE 12 — Wages")).toEqual({
      bucket: "article",
      articleNumber: 12,
    });
    expect(proposalArticleSortKey("Article 3")).toEqual({
      bucket: "article",
      articleNumber: 3,
    });
  });

  it("prefers article match over preamble word in same title", () => {
    expect(proposalArticleSortKey("Article 2 — Introduction")).toEqual({
      bucket: "article",
      articleNumber: 2,
    });
  });

  it("classifies preamble without article number", () => {
    expect(proposalArticleSortKey("Preamble")).toEqual({
      bucket: "preamble",
      articleNumber: null,
    });
    expect(proposalArticleSortKey("Introduction to changes")).toEqual({
      bucket: "preamble",
      articleNumber: null,
    });
  });

  it("classifies other titles", () => {
    expect(proposalArticleSortKey("Wage scale — Added language")).toEqual({
      bucket: "other",
      articleNumber: null,
    });
  });
});

describe("proposal packet sort order", () => {
  it("orders preamble, then articles numerically, then other", () => {
    const out = sortTitles([
      "Article 10 — Z",
      "Preamble",
      "Article 2 — A",
      "Side letter — other",
      "Introduction",
      "Article 2 — B duplicate number tiebreak by title",
    ]);
    expect(out[0]).toBe("Introduction");
    expect(out[1]).toBe("Preamble");
    expect(out[2]).toBe("Article 2 — A");
    expect(out[3]).toBe("Article 2 — B duplicate number tiebreak by title");
    expect(out[4]).toBe("Article 10 — Z");
    expect(out[5]).toBe("Side letter — other");
  });
});

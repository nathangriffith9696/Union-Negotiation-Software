import { describe, expect, it } from "vitest";
import {
  compareProposalsBargainingOrder,
  extractArticleNumberFromTitle,
  proposalArticleSortKey,
  sortProposalsByBargainingOrderSnake,
} from "./proposal-article-sort";

describe("extractArticleNumberFromTitle", () => {
  it("parses case-insensitive Article N with hyphen or en-dash subtitles", () => {
    expect(extractArticleNumberFromTitle("Article 2")).toBe(2);
    expect(extractArticleNumberFromTitle("ARTICLE 2")).toBe(2);
    expect(extractArticleNumberFromTitle("Article 2 - Wages")).toBe(2);
    expect(extractArticleNumberFromTitle("Article 2 – Wages")).toBe(2);
  });

  it("returns null when no numbered article token", () => {
    expect(extractArticleNumberFromTitle("Preamble")).toBeNull();
    expect(extractArticleNumberFromTitle("Side letter A")).toBeNull();
    expect(extractArticleNumberFromTitle("")).toBeNull();
  });
});

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

function sortTitles(titles: string[]): string[] {
  const base = "2000-01-01T00:00:00.000Z";
  const rows = titles.map((title, i) => ({
    title,
    createdAt: base,
    id: `id-${i}`,
  }));
  rows.sort(compareProposalsBargainingOrder);
  return rows.map((r) => r.title);
}

describe("compareProposalsBargainingOrder", () => {
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

  it("uses createdAt when titles are identical", () => {
    const rows = [
      { title: "Article 5 — X", createdAt: "2025-03-02T10:00:00.000Z", id: "b" },
      { title: "Article 5 — X", createdAt: "2025-03-01T10:00:00.000Z", id: "a" },
    ];
    const sorted = [...rows].sort(compareProposalsBargainingOrder);
    expect(sorted[0]!.id).toBe("a");
    expect(sorted[1]!.id).toBe("b");
  });

  it("lists older duplicate Article 1 before newer (negotiation proposals tab uses this order)", () => {
    const rows = [
      {
        id: "newer-a1",
        title: "Article 1",
        created_at: "2025-02-01T12:00:00.000Z",
      },
      {
        id: "older-a1",
        title: "Article 1",
        created_at: "2025-01-01T12:00:00.000Z",
      },
    ];
    const sorted = sortProposalsByBargainingOrderSnake(rows);
    expect(sorted.map((r) => r.id)).toEqual(["older-a1", "newer-a1"]);
  });
});

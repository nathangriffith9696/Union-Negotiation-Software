import type { Change } from "diff";
import { describe, expect, it } from "vitest";
import type { SectionDiffRow } from "./contract-compare";
import {
  findNewestAligningDraftProposalId,
  matchChangedRowsToSavedProposals,
  proposalSaveGroupKey,
  type SavedProposalForReconcile,
} from "./proposal-candidate-reconcile";

function row(
  partial: Partial<SavedProposalForReconcile> &
    Pick<SavedProposalForReconcile, "id" | "title" | "created_at">
): SavedProposalForReconcile {
  return {
    body_html: null,
    status: "draft",
    ...partial,
  };
}

describe("findNewestAligningDraftProposalId", () => {
  it("QA: single Article 2 draft with identical title matches by article number (in-place update target)", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "only-a2",
        title: "Article 2",
        created_at: "2025-01-15T12:00:00Z",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 2", saved)).toBe("only-a2");
  });

  it("QA: two duplicate Article 2 drafts — newest created_at is updated first", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "a2-newer",
        title: "Article 2",
        created_at: "2025-03-01T12:00:00Z",
      }),
      row({
        id: "a2-older",
        title: "Article 2",
        created_at: "2025-01-01T12:00:00Z",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 2", saved)).toBe("a2-newer");
  });

  it("QA: MOU-style title falls back to title alignment when no article number", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "mou-1",
        title: "Memorandum of Understanding",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(
      findNewestAligningDraftProposalId("Memorandum of Understanding", saved)
    ).toBe("mou-1");
  });

  it("returns null when no draft aligns by title", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "a",
        title: "Article 9",
        created_at: "2025-01-02T00:00:00Z",
        status: "draft",
      }),
    ];
    expect(
      findNewestAligningDraftProposalId("Article 10 — Wages", saved)
    ).toBeNull();
  });

  it("ignores non-draft rows even when title aligns", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "sub",
        title: "Article 10 — Wages",
        created_at: "2025-01-03T00:00:00Z",
        status: "submitted",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 10 — Wages", saved)).toBeNull();
  });

  it("returns the newest aligning draft (list ordered created_at desc)", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "newer",
        title: "Article 10 — Wages",
        created_at: "2025-01-03T00:00:00Z",
        status: "draft",
      }),
      row({
        id: "older",
        title: "Article 10 — Wages",
        created_at: "2025-01-01T00:00:00Z",
        status: "draft",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 10 — Wages", saved)).toBe(
      "newer"
    );
  });

  it("returns an older draft when newer matching row is submitted", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "newer-sub",
        title: "Article 10 — Wages",
        created_at: "2025-01-03T00:00:00Z",
        status: "submitted",
      }),
      row({
        id: "draft-ok",
        title: "Article 10 — Wages",
        created_at: "2025-01-01T00:00:00Z",
        status: "draft",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 10 — Wages", saved)).toBe(
      "draft-ok"
    );
  });

  it("matches draft when saved title has subtitle but diff heading is only Article N", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "draft-a2",
        title: "Article 2 — Hours",
        created_at: "2025-01-02T00:00:00Z",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 2", saved)).toBe("draft-a2");
  });

  it("matches ARTICLE 2 and hyphen/en-dash subtitles by article number", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "id-2",
        title: "ARTICLE 2 - Wages",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 2 – Wages", saved)).toBe("id-2");
  });

  it("matches after stripping (was:) from diff heading label", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "id-a2",
        title: "Article 2",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(
      findNewestAligningDraftProposalId("Article 2 (was: Article 2)", saved)
    ).toBe("id-a2");
  });

  it("falls back to title match when neither side has an article number", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "preamble-draft",
        title: "Preamble",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Preamble", saved)).toBe("preamble-draft");
  });

  it("resolves different articles to different draft ids in one save batch (scenario 2)", () => {
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "draft-b",
        title: "Article 2",
        created_at: "2025-01-02T00:00:00Z",
      }),
      row({
        id: "draft-a",
        title: "Article 1",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(findNewestAligningDraftProposalId("Article 1", saved)).toBe("draft-a");
    expect(findNewestAligningDraftProposalId("Article 2", saved)).toBe("draft-b");
    expect(findNewestAligningDraftProposalId("Article 3 — New", saved)).toBeNull();
  });
});

function diffRow(
  index: number,
  headingLabel: string,
  newBodyHtml: string,
  parts: Change[] = []
): SectionDiffRow {
  return {
    index,
    headingLabel,
    parts,
    addedWords: 0,
    removedWords: 0,
    addedChars: 0,
    removedChars: 0,
    hasChange: true,
    newBodyHtml,
  };
}

describe("proposalSaveGroupKey", () => {
  it("uses article number when heading parses as Article N", () => {
    expect(proposalSaveGroupKey("Article 1")).toBe("article:1");
    expect(proposalSaveGroupKey("Article 1 – Wages")).toBe("article:1");
    expect(proposalSaveGroupKey("ARTICLE 12 — Foo")).toBe("article:12");
  });

  it("uses normalized heading for preamble / MOU / non-numbered titles", () => {
    expect(proposalSaveGroupKey("Preamble")).toBe("heading:preamble");
    expect(proposalSaveGroupKey("MOU A")).toBe(proposalSaveGroupKey("mou  a"));
  });
});

describe("draft review visibility vs save path (scenario 5)", () => {
  it("does not treat a section as body-matched when the draft body has diverged (stays actionable)", () => {
    const saved: SavedProposalForReconcile[] = [
      {
        id: "p1",
        title: "Article 5 — Wages",
        body_html: "<p>saved earlier</p>",
        status: "draft",
        created_at: "2025-01-01T00:00:00Z",
      },
    ];
    const row = diffRow(2, "Article 5 — Wages", "<p>edited again</p>", []);
    const canon = (r: SectionDiffRow) => r.newBodyHtml.trim();
    const matched = matchChangedRowsToSavedProposals(
      [row],
      saved,
      canon
    );
    expect(matched.has(row.index)).toBe(false);
    expect(findNewestAligningDraftProposalId(row.headingLabel, saved)).toBe("p1");
  });
});

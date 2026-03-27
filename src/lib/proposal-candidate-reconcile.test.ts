import type { Change } from "diff";
import { describe, expect, it } from "vitest";
import type { SectionDiffRow } from "./contract-compare";
import {
  findNewestAligningDraftProposalId,
  markSectionRowsWhenProposalDraftDrifts,
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

/** Same shape as buildSectionDiffRows when baseline plain === working plain (no redline). */
function stableDiffRow(
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
    hasChange: false,
    newBodyHtml,
  };
}

describe("markSectionRowsWhenProposalDraftDrifts", () => {
  const canon = (r: SectionDiffRow) => r.newBodyHtml.trim();

  it("forces hasChange when snapshot-plain matches but draft body still has extra markup/text", () => {
    const rows = [
      stableDiffRow(0, "Article 2 — Scope", "<p>scope only</p>"),
    ];
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "d1",
        title: "Article 2 — Scope",
        body_html: "<p>scope only</p><p>still in draft</p>",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    const out = markSectionRowsWhenProposalDraftDrifts(rows, saved, canon);
    expect(out[0]!.hasChange).toBe(true);
  });

  it("leaves rows unchanged when merged canon matches the newest aligning draft", () => {
    const rows = [
      stableDiffRow(0, "Article 2", "<p>in sync</p>"),
    ];
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "d1",
        title: "Article 2",
        body_html: "<p>in sync</p>",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    const out = markSectionRowsWhenProposalDraftDrifts(rows, saved, canon);
    expect(out).toBe(rows);
    expect(out[0]!.hasChange).toBe(false);
  });

  it("returns the same array when there are no saved proposals", () => {
    const rows = [stableDiffRow(0, "Article 1", "<p>x</p>")];
    const out = markSectionRowsWhenProposalDraftDrifts(rows, [], canon);
    expect(out).toBe(rows);
  });

  it("marks every row in the same article group when merged canon ≠ draft", () => {
    const rows = [
      stableDiffRow(0, "Article 1 — Alpha", "<p>x</p>"),
      stableDiffRow(1, "Article 1 — Beta", "<p>y</p>"),
    ];
    const saved: SavedProposalForReconcile[] = [
      row({
        id: "merged",
        title: "Article 1 — Alpha",
        body_html: "<p>x</p><p>y</p><p>extra</p>",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(proposalSaveGroupKey(rows[0]!.headingLabel)).toBe(
      proposalSaveGroupKey(rows[1]!.headingLabel)
    );
    const out = markSectionRowsWhenProposalDraftDrifts(rows, saved, canon);
    expect(out[0]!.hasChange).toBe(true);
    expect(out[1]!.hasChange).toBe(true);
  });
});

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

describe("matchChangedRowsToSavedProposals", () => {
  it("ignores submitted rows so a partial snapshot cannot hide work still pending vs the draft (grouped-save regression)", () => {
    const saved: SavedProposalForReconcile[] = [
      {
        id: "sub-partial",
        title: "Article 1 — Scope",
        body_html: "<p>scope</p>",
        status: "submitted",
        created_at: "2025-03-15T12:00:00Z",
      },
      {
        id: "draft-merged",
        title: "Article 1 — Scope",
        body_html: "<p>scope</p><p>hours</p>",
        status: "draft",
        created_at: "2025-03-01T12:00:00Z",
      },
    ];
    const row = diffRow(0, "Article 1 — Scope", "<p>scope</p>", []);
    const canon = (r: SectionDiffRow) => r.newBodyHtml.trim();
    const matched = matchChangedRowsToSavedProposals([row], saved, canon);
    expect(matched.has(row.index)).toBe(false);
  });

  describe("QA: draft-only reconciliation (contract editor proposal review)", () => {
    const canon = (r: SectionDiffRow) => r.newBodyHtml.trim();

    it("1. existing draft + new text in that article → row not matched (shows in proposal review)", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "d-a3",
          title: "Article 3",
          body_html: "<p>stored</p>",
          created_at: "2025-01-01T00:00:00Z",
        }),
      ];
      const rowCh = diffRow(0, "Article 3", "<p>stored plus edit</p>", []);
      const matched = matchChangedRowsToSavedProposals([rowCh], saved, canon);
      expect(matched.has(rowCh.index)).toBe(false);
    });

    it("1b. when working subsection body still matches the draft → row matched (not in unmatched review)", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "d-a3",
          title: "Article 3",
          body_html: "<p>in sync</p>",
          created_at: "2025-01-01T00:00:00Z",
        }),
      ];
      const rowCh = diffRow(0, "Article 3", "<p>in sync</p>", []);
      const matched = matchChangedRowsToSavedProposals([rowCh], saved, canon);
      expect(matched.get(rowCh.index)?.id).toBe("d-a3");
    });

    it("2. newer submitted matches canon but draft does not → submitted does not suppress review", () => {
      const saved: SavedProposalForReconcile[] = [
        {
          id: "sub-new",
          title: "Article 4",
          body_html: "<p>snapshot</p>",
          status: "submitted",
          created_at: "2025-06-01T00:00:00Z",
        },
        {
          id: "d-old",
          title: "Article 4",
          body_html: "<p>older draft</p>",
          status: "draft",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];
      const rowCh = diffRow(0, "Article 4", "<p>snapshot</p>", []);
      const matched = matchChangedRowsToSavedProposals([rowCh], saved, canon);
      expect(matched.has(rowCh.index)).toBe(false);
    });

    it("3. save path still targets the aligning draft for in-place update (submitted does not steal id)", () => {
      const saved: SavedProposalForReconcile[] = [
        {
          id: "sub-new",
          title: "Article 4",
          body_html: "<p>snapshot</p>",
          status: "submitted",
          created_at: "2025-06-01T00:00:00Z",
        },
        {
          id: "d-old",
          title: "Article 4",
          body_html: "<p>older draft</p>",
          status: "draft",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];
      const rowCh = diffRow(0, "Article 4", "<p>revised for save</p>", []);
      expect(findNewestAligningDraftProposalId(rowCh.headingLabel, saved)).toBe(
        "d-old"
      );
    });

    it("4. multiple articles in one diff → each row matches only its own draft", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "d-b",
          title: "Article 2",
          body_html: "<p>b</p>",
          created_at: "2025-02-01T00:00:00Z",
        }),
        row({
          id: "d-a",
          title: "Article 1",
          body_html: "<p>a</p>",
          created_at: "2025-01-01T00:00:00Z",
        }),
      ];
      const r1 = diffRow(0, "Article 1", "<p>a</p>", []);
      const r2 = diffRow(1, "Article 2", "<p>b</p>", []);
      const matched = matchChangedRowsToSavedProposals([r1, r2], saved, canon);
      expect(matched.get(r1.index)?.id).toBe("d-a");
      expect(matched.get(r2.index)?.id).toBe("d-b");
    });
  });

  describe("QA: group-level reconciliation (newest draft + merged body only)", () => {
    const canon = (r: SectionDiffRow) => r.newBodyHtml.trim();

    it("1. newer merged draft + older partial — subsection canon does not fall through to partial draft", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "draft-merged",
          title: "Article 1 — Scope",
          body_html: "<p>a</p><p>b</p>",
          created_at: "2025-03-01T12:00:00Z",
        }),
        row({
          id: "draft-partial",
          title: "Article 1 — Scope",
          body_html: "<p>a</p>",
          created_at: "2025-01-01T12:00:00Z",
        }),
      ];
      const r = diffRow(0, "Article 1 — Scope", "<p>a</p>", []);
      const matched = matchChangedRowsToSavedProposals([r], saved, canon);
      expect(matched.has(r.index)).toBe(false);
    });

    it("2. after save, edit one subsection — merged canon ≠ newest draft → group unmatched", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "d1",
          title: "Article 6",
          body_html: "<p>was saved</p>",
          created_at: "2025-01-01T00:00:00Z",
        }),
      ];
      const r = diffRow(0, "Article 6", "<p>edited after save</p>", []);
      expect(matchChangedRowsToSavedProposals([r], saved, canon).has(r.index)).toBe(
        false
      );
    });

    it("3. multiple rows same article:1 group — merged equals newest draft → all indices matched", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "merged-a1",
          title: "Article 1 — Alpha",
          body_html: "<p>x</p><p>y</p>",
          created_at: "2025-01-01T00:00:00Z",
        }),
      ];
      const r1 = diffRow(0, "Article 1 — Alpha", "<p>x</p>", []);
      const r2 = diffRow(1, "Article 1 — Beta", "<p>y</p>", []);
      expect(proposalSaveGroupKey(r1.headingLabel)).toBe(
        proposalSaveGroupKey(r2.headingLabel)
      );
      const matched = matchChangedRowsToSavedProposals([r1, r2], saved, canon);
      expect(matched.get(r1.index)?.id).toBe("merged-a1");
      expect(matched.get(r2.index)?.id).toBe("merged-a1");
    });

    it("3b. multiple rows same group — merged differs from draft → none matched", () => {
      const saved: SavedProposalForReconcile[] = [
        row({
          id: "merged-a1",
          title: "Article 1 — Alpha",
          body_html: "<p>x</p><p>y</p>",
          created_at: "2025-01-01T00:00:00Z",
        }),
      ];
      const r1 = diffRow(0, "Article 1 — Alpha", "<p>x</p>", []);
      const r2 = diffRow(1, "Article 1 — Beta", "<p>y-changed</p>", []);
      const matched = matchChangedRowsToSavedProposals([r1, r2], saved, canon);
      expect(matched.has(r1.index)).toBe(false);
      expect(matched.has(r2.index)).toBe(false);
    });
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

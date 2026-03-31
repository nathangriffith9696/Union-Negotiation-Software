import { describe, expect, it } from "vitest";
import {
  buildProposalBodyHtmlForSave,
  buildSectionDiffRows,
  type SectionDiffRow,
} from "@/lib/contract-compare";
import {
  proposalSaveGroupKey,
  titlesAlignForProposal,
} from "@/lib/proposal-candidate-reconcile";

/** Mirrors `buildDefaultProposalReviewFields` in ContractEditorPanel. */
function defaultTitleFromHeading(headingLabel: string): string {
  return headingLabel.length > 90
    ? `${headingLabel.slice(0, 87)}…`
    : headingLabel;
}

type ReviewItem = {
  include: boolean;
  title: string;
  category: string;
  summary: string;
};

/**
 * Mirrors `handleSaveSelectedProposals`: group by {@link proposalSaveGroupKey},
 * merge wrapped bodies in diff order, one payload per group.
 */
function buildInsertPayload(
  rows: SectionDiffRow[],
  reviewByIndex: Record<number, ReviewItem>,
  negotiationId: string
): {
  title: string;
  category: string;
  body_html: string | null;
  negotiation_id: string;
}[] {
  const out: {
    title: string;
    category: string;
    body_html: string | null;
    negotiation_id: string;
  }[] = [];

  const selected = rows
    .filter((r) => reviewByIndex[r.index]?.include)
    .sort((a, b) => a.index - b.index);
  const byGroup = new Map<string, SectionDiffRow[]>();
  for (const r of selected) {
    const k = proposalSaveGroupKey(r.headingLabel);
    const g = byGroup.get(k);
    if (g) g.push(r);
    else byGroup.set(k, [r]);
  }

  for (const groupRows of byGroup.values()) {
    groupRows.sort((a, b) => a.index - b.index);
    const primary = groupRows[0]!;
    const it0 = reviewByIndex[primary.index]!;
    const defaults = { title: defaultTitleFromHeading(primary.headingLabel) };
    const resolvedTitle = it0.title.trim() || defaults.title;
    const titleForSave = titlesAlignForProposal(
      primary.headingLabel,
      resolvedTitle
    )
      ? resolvedTitle
      : defaults.title;
    const mergedBodyHtml =
      groupRows.map((r) => buildProposalBodyHtmlForSave(r)).join("") || "";

    out.push({
      negotiation_id: negotiationId,
      title: titleForSave.trim() || "Contract change proposal",
      category: it0.category.trim() || "general",
      body_html: mergedBodyHtml || null,
    });
  }
  return out;
}

const BASELINE = `
<h2>Article 36</h2><p>BASE_A36</p>
<h2>Article 39</h2><p>BASE_A39</p>
<h2>Article 41</h2><p>BASE_A41</p>
`.trim();

const WORKING = `
<h2>Article 36</h2><p>BASE_A36 INS_A36_UNIQUE</p>
<h2>Article 39</h2><p>BASE_A39 INS_A39_UNIQUE</p>
<h2>Article 41</h2><p>BASE_A41 INS_A41_UNIQUE</p>
`.trim();

describe("draft review → save payload (mirrors ContractCompareView save path)", () => {
  it("pairs each diff row headingLabel, newBodyHtml slice, and payload title/body without cross-row bleed", () => {
    const diffRows = buildSectionDiffRows(BASELINE, WORKING);
    const changed = diffRows.filter((r) => r.hasChange);
    expect(changed.length).toBe(3);

    const cases = [
      { num: 36, marker: "INS_A36_UNIQUE" },
      { num: 39, marker: "INS_A39_UNIQUE" },
      { num: 41, marker: "INS_A41_UNIQUE" },
    ] as const;
    for (const { num, marker } of cases) {
      const r = changed.find(
        (row) =>
          row.headingLabel.includes(`Article ${num}`) &&
          row.newBodyHtml.includes(marker)
      );
      expect(r, `row for Article ${num}`).toBeTruthy();
    }

    const review: Record<number, ReviewItem> = {};
    for (const r of changed) {
      review[r.index] = {
        include: true,
        title: defaultTitleFromHeading(r.headingLabel),
        category: "general",
        summary: "",
      };
    }

    const payload = buildInsertPayload(changed, review, "neg-test-uuid");
    expect(payload).toHaveLength(3);

    for (const { num, marker } of cases) {
      const r = changed.find((row) => row.headingLabel.includes(`Article ${num}`))!;
      const p = payload.find((x) => x.title.includes(`Article ${num}`))!;
      expect(p.body_html).toBeTruthy();
      expect(p.body_html).toContain(marker);
      expect(r.newBodyHtml).toContain(marker);
    }
  });

  it("if review title does not align with section heading, payload title is coerced from the diff row", () => {
    const diffRows = buildSectionDiffRows(BASELINE, WORKING);
    const changed = diffRows.filter((r) => r.hasChange);
    const target = changed.find((r) => r.headingLabel.includes("Article 36"))!;
    expect(target).toBeTruthy();

    const review: Record<number, ReviewItem> = {};
    for (const r of changed) {
      review[r.index] = {
        include: true,
        title: defaultTitleFromHeading(r.headingLabel),
        category: "general",
        summary: "",
      };
    }
    review[target.index] = {
      include: true,
      title: "Article 99 — wrong title from stale state",
      category: "general",
      summary: "",
    };

    const payload = buildInsertPayload(changed, review, "neg-test-uuid");
    const for36 = payload.find((p) => p.title.includes("Article 36"));
    expect(for36).toBeTruthy();
    expect(for36!.body_html).toContain("INS_A36_UNIQUE");
    expect(for36!.title).toContain("Article 36");
    expect(for36!.title).not.toContain("Article 99");
  });

  it("merges two selected diff rows for the same article number into one payload", () => {
    const rows: SectionDiffRow[] = [
      {
        index: 1,
        headingLabel: "Article 1",
        newBodyHtml: "<p>alpha</p>",
        parts: [],
        addedWords: 1,
        removedWords: 0,
        addedChars: 1,
        removedChars: 0,
        hasChange: true,
        baselineBodyHtml: "",
      },
      {
        index: 2,
        headingLabel: "Article 1 — Recognition",
        newBodyHtml: "<p>beta</p>",
        parts: [],
        addedWords: 1,
        removedWords: 0,
        addedChars: 1,
        removedChars: 0,
        hasChange: true,
        baselineBodyHtml: "",
      },
    ];
    const review: Record<number, ReviewItem> = {
      1: {
        include: true,
        title: "Article 1",
        category: "general",
        summary: "note one",
      },
      2: {
        include: true,
        title: "Article 1 — Recognition",
        category: "general",
        summary: "note two",
      },
    };
    expect(proposalSaveGroupKey(rows[0]!.headingLabel)).toBe(
      proposalSaveGroupKey(rows[1]!.headingLabel)
    );

    const payload = buildInsertPayload(rows, review, "neg-test-uuid");
    expect(payload).toHaveLength(1);
    expect(payload[0]!.body_html).toContain("alpha");
    expect(payload[0]!.body_html).toContain("beta");
  });
});

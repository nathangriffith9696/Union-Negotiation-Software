import { describe, expect, it } from "vitest";
import {
  buildSectionDiffRows,
  wrapDiffAdditionsInProposalBodyHtml,
  type SectionDiffRow,
} from "@/lib/contract-compare";
import { titlesAlignForProposal } from "@/lib/proposal-candidate-reconcile";

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
 * Mirrors `handleSaveSelectedProposals` payload construction (same row `r` for
 * body; title guard via `titlesAlignForProposal`).
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

  for (const r of rows) {
    const it = reviewByIndex[r.index];
    if (!it?.include) continue;
    const defaults = { title: defaultTitleFromHeading(r.headingLabel) };
    const resolvedTitle = it.title.trim() || defaults.title;
    const titleForSave = titlesAlignForProposal(r.headingLabel, resolvedTitle)
      ? resolvedTitle
      : defaults.title;
    const rawBody = r.newBodyHtml?.trim() ?? "";
    const bodyHtml = rawBody
      ? wrapDiffAdditionsInProposalBodyHtml(rawBody, r.parts)
      : "";
    out.push({
      negotiation_id: negotiationId,
      title: titleForSave.trim() || "Contract change proposal",
      category: it.category.trim() || "general",
      body_html: bodyHtml || null,
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
});

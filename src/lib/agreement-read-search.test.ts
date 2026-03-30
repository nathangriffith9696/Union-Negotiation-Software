import { describe, expect, it } from "vitest";
import {
  countAgreementMatches,
  extractAgreementHeadings,
} from "./agreement-read-search";

describe("extractAgreementHeadings", () => {
  it("returns heading levels and text", () => {
    const html =
      "<h1>Title</h1><p>x</p><h2>Sub</h2><h3>Deep</h3>";
    const h = extractAgreementHeadings(html);
    expect(h).toHaveLength(3);
    expect(h[0]).toMatchObject({ index: 0, level: 1, text: "Title" });
    expect(h[1]).toMatchObject({ index: 1, level: 2, text: "Sub" });
    expect(h[2]).toMatchObject({ index: 2, level: 3, text: "Deep" });
  });
});

describe("countAgreementMatches", () => {
  it("counts case-insensitive substring in text nodes", () => {
    const html = "<p>Hello hello HELLO</p>";
    expect(countAgreementMatches(html, "h")).toBe(0);
    expect(countAgreementMatches(html, "hel")).toBe(3);
    expect(countAgreementMatches(html, "hello")).toBe(3);
  });
});

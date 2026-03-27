import { describe, expect, it } from "vitest";
import { contractTextToHtml, escapeHtmlForText } from "./master-contract-html";

describe("escapeHtmlForText", () => {
  it("escapes special characters", () => {
    expect(escapeHtmlForText(`a<b>"c"&`)).toBe(
      "a&lt;b&gt;&quot;c&quot;&amp;"
    );
  });
});

describe("contractTextToHtml", () => {
  it("wraps paragraphs and line breaks", () => {
    const html = contractTextToHtml("Line one\nLine two\n\nSecond block");
    expect(html).toContain("<p>");
    expect(html).toContain("Line one<br />Line two");
    expect(html).toContain("Second block");
  });

  it("returns empty paragraph for blank input", () => {
    expect(contractTextToHtml("   ")).toBe("<p></p>");
  });
});

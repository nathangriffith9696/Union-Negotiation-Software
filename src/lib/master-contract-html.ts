/**
 * Escape text for safe inclusion in HTML, then wrap blocks in <p> for TipTap-style content.
 */
export function escapeHtmlForText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Turn plain .txt (paragraphs separated by blank lines) into minimal HTML for the contract editor.
 */
export function contractTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "<p></p>";
  }
  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) {
    return "<p></p>";
  }
  return blocks
    .map((block) => {
      const escaped = escapeHtmlForText(block);
      const withBreaks = escaped.replace(/\n/g, "<br />");
      return `<p>${withBreaks}</p>`;
    })
    .join("");
}

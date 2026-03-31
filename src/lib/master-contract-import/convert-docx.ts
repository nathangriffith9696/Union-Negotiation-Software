import mammoth from "mammoth";

/**
 * Word built-in styles → Heading 1–3. No post-hoc heading level changes.
 */
const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
];

export type ConvertDocxResult = {
  html: string;
  messages: string[];
};

/**
 * Convert OOXML .docx to HTML via Mammoth.
 */
export async function convertDocxToHtml(
  arrayBuffer: ArrayBuffer
): Promise<ConvertDocxResult> {
  // Mammoth expects `buffer`, `path`, or `file` — not `arrayBuffer` (see mammoth/lib/unzip.js).
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(arrayBuffer) },
    { styleMap: STYLE_MAP }
  );
  const messages = result.messages.map((m) => m.message);
  return { html: result.value, messages };
}

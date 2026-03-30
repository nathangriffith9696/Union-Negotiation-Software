import { convertDocxToHtml } from "./convert-docx";
import { htmlToPlainText } from "./html-to-plain-text";
import { normalizeContractHtml } from "./normalize-html";
import { sanitizeContractHtml } from "./sanitize-html";
import type { ImportValidationResult } from "./types";
import { extractImportStats, validateContractImport } from "./validate-import";

export const MAX_DOCX_BYTES = 15 * 1024 * 1024;

export type StrictImportPipelineResult = {
  body_html: string;
  body_text: string;
  validation: ImportValidationResult;
};

/**
 * docx → sanitize → normalize → plain text → validate. Preview HTML is `body_html`.
 */
export async function runStrictImportPipeline(
  arrayBuffer: ArrayBuffer
): Promise<StrictImportPipelineResult> {
  const { html: rawHtml, messages } = await convertDocxToHtml(arrayBuffer);
  const sanitized = sanitizeContractHtml(rawHtml);
  const { html: normalized, emptyParagraphsRemoved } =
    normalizeContractHtml(sanitized);
  const body_text = htmlToPlainText(normalized);
  const stats = extractImportStats(normalized);
  const validation = validateContractImport(normalized, body_text, {
    ...stats,
    emptyParagraphsRemoved,
  });
  validation.converterNotes = messages;
  return {
    body_html: normalized,
    body_text,
    validation,
  };
}

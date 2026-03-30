/**
 * Strict .docx → HTML import: validation payload stored in staging and import_metadata.
 */

export type ImportValidationIssue = {
  code: string;
  message: string;
  detail?: string;
};

export type ImportValidationStats = {
  headingH1: number;
  headingH2: number;
  headingH3: number;
  headingH4Plus: number;
  paragraphCount: number;
  tableCount: number;
  unorderedListCount: number;
  orderedListCount: number;
  listItemCount: number;
  emptyParagraphsRemoved: number;
};

export type ImportValidationResult = {
  ok: boolean;
  mode: "strict";
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
  stats: ImportValidationStats;
  converterNotes: string[];
};

/** Snapshot written to `master_contracts.import_metadata` on commit. */
export type MasterContractImportMetadata = {
  source: "docx_import";
  import_mode: "strict";
  original_filename: string;
  staged_import_id: string;
  analyzed_at: string;
  committed_at: string;
  validation: ImportValidationResult;
};

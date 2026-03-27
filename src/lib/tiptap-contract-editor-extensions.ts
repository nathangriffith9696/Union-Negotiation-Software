import type { Extensions } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table/kit";
import StarterKit from "@tiptap/starter-kit";

/**
 * Shared TipTap setup for collective-agreement HTML: headings, lists, emphasis,
 * and tables (wage scales, holiday calendars, etc.).
 */
export const contractEditorTipTapExtensions: Extensions = [
  StarterKit,
  TableKit.configure({
    table: {
      resizable: false,
    },
  }),
];

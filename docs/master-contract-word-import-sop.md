# SOP: Preparing master contracts in Microsoft Word for import

**Purpose.** Union contracts are imported into our software as `.docx` files. This document tells you exactly how to structure Word so imports succeed and the agreement’s outline (articles → sections → subsections) works in the product.

**Deliverable.** One clean `.docx` per contract, saved in **Office Open XML** format (standard Word `.docx`—not PDF, not `.doc`).

---

## 1. Heading hierarchy (required)

Use **only** Word’s built-in styles **Heading 1**, **Heading 2**, and **Heading 3** for structural titles. Do **not** fake headings with bold, font size, or all caps on Normal text.

| Word style   | Meaning in software   | Typical use        |
|-------------|------------------------|--------------------|
| Heading 1   | Article                | Top-level chapters |
| Heading 2   | Section                | Major divisions    |
| Heading 3   | Subsection             | Smaller divisions  |

**Do not use Heading 4, 5, or 6.** If you need a fourth level of label, use **Normal** body text (e.g. bold lead-in, numbered “(a) (b)”, or a short paragraph under the nearest Heading 3).

---

## 2. First heading rule

The **first** heading in the document (top to bottom) must be **Heading 1**. If there is cover text, a title page, or preamble, either keep it as Normal paragraphs *above* the first Heading 1, or make the main title **Heading 1** so the outline still starts correctly.

---

## 3. No skipped levels when going deeper

When moving **to a deeper** level, increase by **one step** at a time.

- Allowed: H1 → H2 → H3; H2 → H3; H3 → H2; H2 → H1; H3 → H1.
- **Not allowed:** H1 → H3 without an H2 between (same for H2 → H4—H4 is not allowed anyway).

“Going back up” (e.g. H3 then a new H1 for the next article) is fine.

---

## 4. Body text, lists, and tables

- **Body:** Use **Normal** for paragraphs.
- **Lists:** Use Word’s real **bulleted** and **numbered** lists (not manual hyphens or typed numbers in Normal paragraphs unless intentional).
- **Tables:** Use **Insert → Table** (real tables). Avoid messy merges if you can; uneven columns may trigger review warnings.

---

## 5. Inline formatting and links

Bold, italic, underline, and similar are fine. For hyperlinks, keep them to standard **http** / **https** links (or in-document anchors if used).

---

## 6. Quality checklist before submit

Before you mark a file done, confirm:

1. [ ] Every structural title uses **Heading 1**, **2**, or **3** only—no Heading 4+.
2. [ ] The **first** heading in the file is **Heading 1**.
3. [ ] No place jumps **down** two levels at once (e.g. no H1 straight to H3).
4. [ ] Body text is **Normal**; lists are real lists; tables are real tables.
5. [ ] No empty or placeholder-only document—there must be real contract text.
6. [ ] File is **.docx** and opens cleanly in current Word.

---

## 7. Handoff

Name files predictably (e.g. `LocalName_CBA_2024.docx`). If the organization uses a staging spreadsheet or ticket, record the filename and local/employer name as requested by the project lead.

**Note:** Final technical validation may be run in the admin app (analyze/preview). If an import fails, errors usually point to heading structure—recheck sections 1–3 above first.

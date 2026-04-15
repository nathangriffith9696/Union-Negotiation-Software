"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  countAgreementMatches,
  extractAgreementHeadings,
  highlightAgreementMatches,
  scrollToAgreementHeading,
} from "@/lib/agreement-read-search";
import { formatDate } from "@/lib/format";
import { labelsFromLocalRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type DetailRow = {
  id: string;
  version_number: number;
  created_at: string;
  file_name: string | null;
  body_html: string;
  locals: {
    name: string;
    districts: { name: string } | { name: string }[] | null;
  } | null;
};

function AgreementReaderView({ row }: { row: DetailRow }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const headings = useMemo(
    () => extractAgreementHeadings(row.body_html),
    [row.body_html]
  );

  const filteredHeadings = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (q.length < 2) return headings;
    return headings.filter((h) => h.text.toLowerCase().includes(q));
  }, [headings, debouncedSearch]);

  const matchCount = useMemo(
    () => countAgreementMatches(row.body_html, debouncedSearch),
    [row.body_html, debouncedSearch]
  );

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return () => {};
    return highlightAgreementMatches(el, debouncedSearch);
  }, [row.body_html, debouncedSearch]);

  const goToFirstMatch = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const hit = root.querySelector("mark.agreement-search-hit");
    hit?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <Card className="h-fit w-full shrink-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[min(85vh,40rem)] lg:w-72 lg:overflow-hidden xl:w-80">
        <div>
          <label
            htmlFor="agreement-search"
            className="block text-sm font-medium text-slate-800"
          >
            Search
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Sections and full text. Use at least two characters.
          </p>
          <input
            id="agreement-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. wage, vacation, Article 5"
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
          />
          {debouncedSearch.trim().length >= 2 ? (
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{matchCount}</span>{" "}
              match{matchCount === 1 ? "" : "es"} in the document
              {matchCount > 0 ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => goToFirstMatch()}
                    className="font-medium text-slate-700 underline decoration-slate-400 underline-offset-2 hover:text-slate-900"
                  >
                    Jump to first
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <h2 className="text-sm font-semibold text-slate-900">Sections</h2>
          {headings.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No headings (H1–H3) in this document. Search still highlights
              keywords in paragraphs.
            </p>
          ) : filteredHeadings.length === 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              No section titles match this search.
            </p>
          ) : (
            <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto lg:max-h-[min(60vh,24rem)]">
              {filteredHeadings.map((h) => (
                <li key={`${h.index}-${h.text}`}>
                  <button
                    type="button"
                    onClick={() =>
                      scrollToAgreementHeading(contentRef.current, h.index)
                    }
                    title={h.text}
                    style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }}
                    className="w-full rounded-md py-1.5 pr-1 text-left text-xs leading-snug text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <span className="line-clamp-3">{h.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="min-w-0 flex-1 p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Published text (read-only)
          </p>
        </div>
        <div
          ref={contentRef}
          className="contract-editor-rich-preview max-h-[min(80vh,48rem)] overflow-y-auto p-4 sm:p-6 text-sm leading-relaxed text-slate-900 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-2 [&_li]:my-1"
          dangerouslySetInnerHTML={{ __html: row.body_html }}
        />
      </Card>
    </div>
  );
}

export default function AgreementDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "not_found" }
    | { kind: "error"; message: string }
    | { kind: "ready"; row: DetailRow }
  >({ kind: "loading" });

  useEffect(() => {
    if (!id) {
      setState({ kind: "not_found" });
      return;
    }
    if (!isSupabaseConfigured()) {
      setState({
        kind: "error",
        message:
          "Supabase is not configured. Connect the app to load agreements.",
      });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });

    void (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase
          .from("master_contracts")
          .select(
            `
            id,
            version_number,
            created_at,
            file_name,
            body_html,
            locals ( name, districts ( name ) )
          `
          )
          .eq("id", id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setState({ kind: "error", message: error.message });
          return;
        }
        if (!data) {
          setState({ kind: "not_found" });
          return;
        }

        setState({ kind: "ready", row: data as unknown as DetailRow });
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Something went wrong",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <>
        <p className="mb-4 text-sm">
          <Link
            href="/contracts"
            className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            ← All agreements
          </Link>
        </p>
        <PageHeader title="Agreement" description="Loading…" />
        <Card>
          <p className="text-sm text-slate-600">Loading…</p>
        </Card>
      </>
    );
  }

  if (state.kind === "not_found") {
    return (
      <>
        <p className="mb-4 text-sm">
          <Link
            href="/contracts"
            className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            ← All agreements
          </Link>
        </p>
        <PageHeader title="Agreement" description="Not found." />
        <Card>
          <p className="text-sm text-slate-600">
            This agreement is missing or you do not have access (check your
            local assignments).
          </p>
        </Card>
      </>
    );
  }

  if (state.kind === "error") {
    return (
      <>
        <p className="mb-4 text-sm">
          <Link
            href="/contracts"
            className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            ← All agreements
          </Link>
        </p>
        <PageHeader title="Agreement" description="Could not load." />
        <Card>
          <p className="text-sm text-red-800">{state.message}</p>
        </Card>
      </>
    );
  }

  const { row } = state;
  const { localName, districtName } = labelsFromLocalRelation(row.locals);

  return (
    <>
      <p className="mb-4 text-sm">
        <Link
          href="/contracts"
          className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← All agreements
        </Link>
      </p>

      <PageHeader
        title={`${localName}`}
        description={`${districtName} · Master version ${row.version_number}${
          row.file_name ? ` · ${row.file_name}` : ""
        } · ${formatDate(row.created_at)}`}
      />

      <AgreementReaderView row={row} />
    </>
  );
}

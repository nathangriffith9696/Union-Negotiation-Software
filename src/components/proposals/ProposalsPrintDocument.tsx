"use client";

import { useMemo } from "react";
import { formatDate, formatStatus } from "@/lib/format";
import { compareProposalsBargainingOrder } from "@/lib/proposal-article-sort";
import type { ProposalStatus, ProposingParty } from "@/types/database";

export type ProposalsPrintRow = {
  id: string;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string | null;
  /** Rich HTML (contract editor / TipTap); bargaining packet prefers this over plain summary. */
  bodyHtml: string | null;
  proposingParty: ProposingParty;
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
  /** Used for stable ordering within the same title/article bucket (e.g. from `created_at`). */
  createdAt?: string | null;
};

function groupByNegotiationSorted(
  rows: ProposalsPrintRow[]
): { negotiationTitle: string; proposals: ProposalsPrintRow[] }[] {
  const map = new Map<string, ProposalsPrintRow[]>();
  for (const row of rows) {
    const key = row.negotiationTitle;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" })
    )
    .map(([negotiationTitle, proposals]) => ({
      negotiationTitle,
      proposals: [...proposals].sort((a, b) =>
        compareProposalsBargainingOrder(
          {
            title: a.title,
            createdAt: a.createdAt?.trim() || "",
            id: a.id,
          },
          {
            title: b.title,
            createdAt: b.createdAt?.trim() || "",
            id: b.id,
          }
        )
      ),
    }));
}

type SectionMeta =
  | { kind: "uniform"; line: string }
  | { kind: "mixed" };

function sectionPartyStatusMeta(proposals: ProposalsPrintRow[]): SectionMeta {
  const parties = new Set(proposals.map((p) => p.proposingParty));
  const statuses = new Set(proposals.map((p) => p.status));
  if (parties.size === 1 && statuses.size === 1) {
    const party = [...parties][0]!;
    const st = [...statuses][0]!;
    return {
      kind: "uniform",
      line: `${formatStatus(party)} · ${formatStatus(st)}`,
    };
  }
  return { kind: "mixed" };
}

export function ProposalsPrintDocument({
  rows,
  generatedAtIso,
}: {
  rows: ProposalsPrintRow[];
  generatedAtIso: string;
}) {
  const groups = useMemo(() => groupByNegotiationSorted(rows), [rows]);

  if (rows.length === 0) return null;

  return (
    <div
      id="proposals-print-document"
      lang="en"
      className="proposal-packet-root hidden max-w-none print:block"
    >
      <header className="packet-doc-header print:break-inside-avoid">
        <p className="packet-doc-kicker">Bargaining packet</p>
        <h1 className="packet-doc-title">Contract proposals</h1>
        <p className="packet-doc-meta">
          Generated {formatDate(generatedAtIso)} · {rows.length}{" "}
          {rows.length === 1 ? "proposal" : "proposals"}
        </p>
      </header>

      <div className="packet-negotiations">
        {groups.map((group, groupIndex) => {
          const ctx = group.proposals[0];
          const meta = sectionPartyStatusMeta(group.proposals);
          return (
            <section
              key={group.negotiationTitle}
              className={`packet-negotiation ${groupIndex > 0 ? "packet-negotiation--page-break" : ""}`}
            >
              <header className="packet-negotiation-header print:break-inside-avoid">
                <h2 className="packet-negotiation-title">{group.negotiationTitle}</h2>
                {ctx ? (
                  <p className="packet-negotiation-context">
                    {ctx.bargainingUnitName} · {ctx.localName} ·{" "}
                    {ctx.districtName}
                  </p>
                ) : null}
                {meta.kind === "uniform" ? (
                  <p className="packet-negotiation-tracking">{meta.line}</p>
                ) : null}
              </header>

              <div className="packet-articles">
                {group.proposals.map((p) => (
                  <article
                    key={p.id}
                    className="packet-article print:break-inside-avoid"
                  >
                    <h3 className="packet-article-heading">{p.title}</h3>
                    {meta.kind === "mixed" ? (
                      <p className="packet-article-inline-meta">
                        {formatStatus(p.proposingParty)} ·{" "}
                        {formatStatus(p.status)}
                      </p>
                    ) : null}
                    <div className="packet-article-body">
                      {p.bodyHtml?.trim() ? (
                        <div
                          className="packet-article-prose packet-article-prose--rich"
                          // Trusted app content from our contract editor / DB; same origin as version HTML.
                          dangerouslySetInnerHTML={{
                            __html: p.bodyHtml.trim(),
                          }}
                        />
                      ) : p.summary?.trim() ? (
                        <div className="packet-article-prose whitespace-pre-wrap">
                          {p.summary}
                        </div>
                      ) : (
                        <p className="packet-article-prose packet-article-prose--empty">
                          [No proposal language on file.]
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

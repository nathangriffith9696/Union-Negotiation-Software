import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  bargainingUnits,
  getBargainingUnitById,
  notes,
  proposals,
} from "@/data/mock";
import { formatDate, formatStatus } from "@/lib/format";

export default function ProposalsPage() {
  const proposalNotes = (proposalId: string) =>
    notes.filter((n) => n.proposalId === proposalId);

  return (
    <>
      <PageHeader
        title="Proposals"
        description="Contract proposals linked to bargaining units and sessions. Notes are shown per proposal."
      />

      <div className="space-y-6">
        {proposals.map((p) => {
          const bu = getBargainingUnitById(p.bargainingUnitId);
          const related = proposalNotes(p.id);
          return (
            <Card key={p.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {p.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    {p.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                      {p.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {formatStatus(p.status)}
                    </span>
                  </div>
                </div>
                <dl className="shrink-0 text-sm text-slate-600 lg:text-right">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">
                      Unit
                    </dt>
                    <dd className="font-medium text-slate-800">{bu?.name}</dd>
                  </div>
                  <div className="mt-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">
                      Created
                    </dt>
                    <dd>{formatDate(p.createdAt)}</dd>
                  </div>
                </dl>
              </div>

              {related.length > 0 ? (
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notes
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {related.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                      >
                        <p>{n.body}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {n.author} · {formatDate(n.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        {proposals.length} proposals across {bargainingUnits.length} bargaining
        units (mock).
      </p>
    </>
  );
}

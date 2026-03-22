import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getBargainingUnitById,
  notes,
  sessions,
} from "@/data/mock";
import { formatDate, formatStatus } from "@/lib/format";

export default function SessionsPage() {
  const sessionNotes = (sessionId: string) =>
    notes.filter((n) => n.sessionId === sessionId);

  const ordered = [...sessions].sort(
    (a, b) =>
      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  return (
    <>
      <PageHeader
        title="Bargaining sessions"
        description="Scheduled and completed negotiation meetings with session-level notes."
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface-card shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Session</th>
              <th className="px-5 py-3">Unit</th>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Location</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ordered.map((s) => {
              const bu = getBargainingUnitById(s.bargainingUnitId);
              return (
                <tr key={s.id} className="bg-white hover:bg-slate-50/80">
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {s.title}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{bu?.name}</td>
                  <td className="px-5 py-4 text-slate-600 whitespace-nowrap">
                    {formatDate(s.scheduledAt)}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{s.location}</td>
                  <td className="px-5 py-4">
                    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {formatStatus(s.status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-slate-900">
          Session notes
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {ordered.map((s) => {
            const related = sessionNotes(s.id);
            if (related.length === 0) return null;
            return (
              <Card key={`notes-${s.id}`}>
                <h3 className="font-medium text-slate-900">{s.title}</h3>
                <p className="text-xs text-slate-500">
                  {formatDate(s.scheduledAt)}
                </p>
                <ul className="mt-3 space-y-2">
                  {related.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700"
                    >
                      {n.body}
                      <p className="mt-1 text-xs text-slate-500">
                        {n.author} · {formatDate(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}

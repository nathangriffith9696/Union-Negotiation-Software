import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  bargainingUnits,
  districts,
  locals,
  proposals,
  sessions,
} from "@/data/mock";
import { formatDate, formatStatus } from "@/lib/format";
import Link from "next/link";

export default function DashboardPage() {
  const upcoming = [...sessions]
    .filter((s) => s.status === "scheduled" || s.status === "in_progress")
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    .slice(0, 4);

  const activeProposals = proposals.filter(
    (p) => p.status === "in_negotiation" || p.status === "submitted"
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of districts, locals, bargaining activity, and open proposals."
      />

      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Districts
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {districts.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Locals
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {locals.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Bargaining units
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {bargainingUnits.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Open proposals
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {activeProposals.length}
          </p>
        </Card>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Upcoming sessions
            </h2>
            <Link
              href="/sessions"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {upcoming.map((s) => (
              <li key={s.id} className="px-5 py-4">
                <p className="font-medium text-slate-900">{s.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(s.scheduledAt)} · {s.location}
                </p>
                <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {formatStatus(s.status)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Active proposals
            </h2>
            <Link
              href="/proposals"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {activeProposals.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <p className="font-medium text-slate-900">{p.title}</p>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                  {p.summary}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">
                    {p.category}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {formatStatus(p.status)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

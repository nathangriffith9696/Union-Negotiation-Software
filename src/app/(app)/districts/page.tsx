import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { districts, locals } from "@/data/mock";

export default function DistrictsPage() {
  return (
    <>
      <PageHeader
        title="Districts"
        description="Organizational districts and the locals chartered within each."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {districts.map((d) => {
          const inDistrict = locals.filter((l) => l.districtId === d.id);
          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {d.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{d.region}</p>
                </div>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">
                  {d.code}
                </span>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Locals in district
                </h3>
                <ul className="mt-3 space-y-2">
                  {inDistrict.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">
                        {l.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {l.memberCount.toLocaleString()} members
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

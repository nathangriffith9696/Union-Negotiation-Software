import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  bargainingUnits,
  getDistrictById,
  locals,
} from "@/data/mock";

export default function LocalsPage() {
  return (
    <>
      <PageHeader
        title="Locals"
        description="Chartered locals, member counts, and associated bargaining units."
      />

      <div className="space-y-6">
        {locals.map((l) => {
          const district = getDistrictById(l.districtId);
          const units = bargainingUnits.filter((b) => b.localId === l.id);
          return (
            <Card key={l.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {l.name}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {district?.name} · Charter {l.charterNumber}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {l.memberCount.toLocaleString()} members
                </p>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bargaining units
                </h3>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {units.map((u) => (
                    <li
                      key={u.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
                    >
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {u.employerName}
                      </p>
                      <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                        {u.description}
                      </p>
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

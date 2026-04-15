"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { labelsFromLocalRelation } from "@/lib/supabase-embeds";
import { createSupabaseClient } from "@/lib/supabase";
import type { DistrictRow, LocalRow } from "@/types/database";

type LocalWithDistrict = LocalRow & {
  districts: { name: string } | { name: string }[] | null;
};

export function AdminDistrictsLocalsCard({
  onCatalogChanged,
}: {
  onCatalogChanged?: () => void;
}) {
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [locals, setLocals] = useState<LocalWithDistrict[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [dName, setDName] = useState("");
  const [dRegion, setDRegion] = useState("");
  const [dCode, setDCode] = useState("");
  const [savingDistrict, setSavingDistrict] = useState(false);

  const [lDistrictId, setLDistrictId] = useState("");
  const [lName, setLName] = useState("");
  const [lCharter, setLCharter] = useState("");
  const [lMembers, setLMembers] = useState("");
  const [savingLocal, setSavingLocal] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const [dRes, lRes] = await Promise.all([
        supabase.from("districts").select("*").order("name"),
        supabase
          .from("locals")
          .select("*, districts ( name )")
          .order("name"),
      ]);
      if (dRes.error) throw new Error(dRes.error.message);
      if (lRes.error) throw new Error(lRes.error.message);
      setDistricts((dRes.data ?? []) as DistrictRow[]);
      setLocals((lRes.data ?? []) as unknown as LocalWithDistrict[]);
      setLDistrictId((prev) => {
        const list = (dRes.data ?? []) as DistrictRow[];
        if (prev && list.some((d) => d.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const localsByDistrict = useMemo(() => {
    const m = new Map<string, number>();
    for (const loc of locals) {
      m.set(loc.district_id, (m.get(loc.district_id) ?? 0) + 1);
    }
    return m;
  }, [locals]);

  function localLabel(row: LocalWithDistrict): string {
    const { localName, districtName } = labelsFromLocalRelation({
      name: row.name,
      districts: row.districts,
    });
    return `${localName} · ${districtName}`;
  }

  async function submitDistrict(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const name = dName.trim();
    const region = dRegion.trim();
    const code = dCode.trim().toUpperCase();
    if (!name || !region || !code) {
      setErr("District name, region, and code are required.");
      return;
    }
    setSavingDistrict(true);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.from("districts").insert({
        name,
        region,
        code,
      } as never);
      if (error) throw new Error(error.message);
      setDName("");
      setDRegion("");
      setDCode("");
      setMsg("District added.");
      onCatalogChanged?.();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add district");
    } finally {
      setSavingDistrict(false);
    }
  }

  async function submitLocal(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const name = lName.trim();
    const charter = lCharter.trim();
    if (!lDistrictId || !name || !charter) {
      setErr("District, local name, and charter number are required.");
      return;
    }
    const memberCount = Math.max(0, Math.floor(Number(lMembers) || 0));
    setSavingLocal(true);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.from("locals").insert({
        district_id: lDistrictId,
        name,
        charter_number: charter,
        member_count: memberCount,
      } as never);
      if (error) throw new Error(error.message);
      setLName("");
      setLCharter("");
      setLMembers("");
      setMsg("Local added.");
      onCatalogChanged?.();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add local");
    } finally {
      setSavingLocal(false);
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">
        Districts &amp; locals
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Create geographic districts, then add one or more locals per district.
        Each local can have its own master contract and negotiations.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Loading catalog…</p>
      ) : null}

      {err ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {msg}
        </p>
      ) : null}

      {!loading ? (
        <div className="mt-6 space-y-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Add district
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Code must be unique (used internally). Region is a label such
                as state or area.
              </p>
              <form className="mt-4 space-y-3" onSubmit={(e) => void submitDistrict(e)}>
                <div>
                  <label
                    htmlFor="new-district-name"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Name
                  </label>
                  <input
                    id="new-district-name"
                    value={dName}
                    onChange={(e) => setDName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-district-region"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Region
                  </label>
                  <input
                    id="new-district-region"
                    value={dRegion}
                    onChange={(e) => setDRegion(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-district-code"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Code
                  </label>
                  <input
                    id="new-district-code"
                    value={dCode}
                    onChange={(e) => setDCode(e.target.value)}
                    placeholder="e.g. NE-03"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingDistrict}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {savingDistrict ? "Saving…" : "Add district"}
                </button>
              </form>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800">Add local</h3>
              <p className="mt-1 text-xs text-slate-500">
                Locals belong to one district. Add bargaining units and
                negotiations from the rest of the app once the local exists.
              </p>
              <form className="mt-4 space-y-3" onSubmit={(e) => void submitLocal(e)}>
                <div>
                  <label
                    htmlFor="new-local-district"
                    className="block text-xs font-medium text-slate-600"
                  >
                    District
                  </label>
                  <select
                    id="new-local-district"
                    value={lDistrictId}
                    onChange={(e) => setLDistrictId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {districts.length === 0 ? (
                      <option value="">Add a district first</option>
                    ) : (
                      districts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-local-name"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Local name
                  </label>
                  <input
                    id="new-local-name"
                    value={lName}
                    onChange={(e) => setLName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-local-charter"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Charter number
                  </label>
                  <input
                    id="new-local-charter"
                    value={lCharter}
                    onChange={(e) => setLCharter(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-local-members"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Member count (optional)
                  </label>
                  <input
                    id="new-local-members"
                    type="number"
                    min={0}
                    step={1}
                    value={lMembers}
                    onChange={(e) => setLMembers(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingLocal || districts.length === 0}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingLocal ? "Saving…" : "Add local"}
                </button>
              </form>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">Current catalog</h3>
            <p className="mt-1 text-xs text-slate-500">
              {districts.length} district
              {districts.length === 1 ? "" : "s"}, {locals.length} local
              {locals.length === 1 ? "" : "s"}.
            </p>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">District</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2 text-right">Locals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {districts.map((d) => (
                    <tr key={d.id} className="bg-white">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {d.name}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{d.code}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {localsByDistrict.get(d.id) ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {districts.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  No districts yet.
                </p>
              ) : null}
            </div>

            {locals.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-600">Locals</p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-slate-800">
                  {locals.map((loc) => (
                    <li key={loc.id} className="truncate rounded bg-slate-50/80 px-2 py-1">
                      {localLabel(loc)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

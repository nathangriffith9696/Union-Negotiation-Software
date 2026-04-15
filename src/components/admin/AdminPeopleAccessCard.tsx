"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  canManageFieldRepAssignments,
  formatAppRole,
} from "@/lib/profiles";
import {
  districtNameFromEmbed,
  labelsFromLocalRelation,
} from "@/lib/supabase-embeds";
import { createSupabaseClient } from "@/lib/supabase";
import type { AppRole } from "@/types/database";

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: AppRole;
};

type DistrictOpt = { id: string; name: string };

type LocalOption = {
  id: string;
  name: string;
  district_id: string;
  districts: { name: string } | { name: string }[] | null;
};

type FieldRep = { id: string; display_name: string | null; role: AppRole };

function localLabel(row: LocalOption): string {
  const { localName, districtName } = labelsFromLocalRelation({
    name: row.name,
    districts: row.districts,
  });
  return `${localName} · ${districtName}`;
}

function localSearchText(row: LocalOption): string {
  const { localName, districtName } = labelsFromLocalRelation({
    name: row.name,
    districts: row.districts,
  });
  return `${localName} ${districtName}`.toLowerCase();
}

export function AdminPeopleAccessCard({
  viewerRole,
  catalogRevision = 0,
  peopleRevision = 0,
}: {
  viewerRole: AppRole;
  /** Increment when districts/locals change elsewhere (e.g. admin catalog). */
  catalogRevision?: number;
  /** Increment when users are removed or roles change elsewhere (e.g. admin delete user). */
  peopleRevision?: number;
}) {
  const isSuper = viewerRole === "super_admin";
  const canAssignReps = canManageFieldRepAssignments(viewerRole);

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [rddMap, setRddMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [roleDraft, setRoleDraft] = useState<Record<string, AppRole>>({});
  const [districtDraft, setDistrictDraft] = useState<Record<string, Set<string>>>({});

  const [fieldReps, setFieldReps] = useState<FieldRep[]>([]);
  const [locals, setLocals] = useState<LocalOption[]>([]);
  const [selectedRepId, setSelectedRepId] = useState("");
  const [assignedLocals, setAssignedLocals] = useState<Set<string>>(
    () => new Set()
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [savingReps, setSavingReps] = useState(false);

  const [localQuery, setLocalQuery] = useState("");
  const [districtFilterId, setDistrictFilterId] = useState<string>("all");

  const loadStaff = useCallback(async () => {
    if (!isSuper) return;
    const supabase = createSupabaseClient();
    const [pRes, dRes, rRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, role")
        .order("display_name", { ascending: true }),
      supabase.from("districts").select("id, name").order("name"),
      supabase.from("regional_director_districts").select("user_id, district_id"),
    ]);
    if (pRes.error) throw new Error(pRes.error.message);
    if (dRes.error) throw new Error(dRes.error.message);
    if (rRes.error) throw new Error(rRes.error.message);

    const rows = (pRes.data ?? []) as ProfileRow[];
    setProfiles(rows);
    const rd: Record<string, AppRole> = {};
    for (const p of rows) rd[p.id] = p.role;
    setRoleDraft(rd);
    setDistricts((dRes.data ?? []) as DistrictOpt[]);

    const m = new Map<string, Set<string>>();
    for (const row of rRes.data ?? []) {
      const r = row as { user_id: string; district_id: string };
      const s = m.get(r.user_id) ?? new Set<string>();
      s.add(r.district_id);
      m.set(r.user_id, s);
    }
    setRddMap(m);
    const dd: Record<string, Set<string>> = {};
    for (const [uid, set] of m) dd[uid] = new Set(set);
    setDistrictDraft(dd);
  }, [isSuper]);

  const loadFieldReps = useCallback(async () => {
    if (!canAssignReps) return;
    const supabase = createSupabaseClient();
    const [pRes, lRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, role")
        .eq("role", "field_rep")
        .order("display_name"),
      supabase
        .from("locals")
        .select("id, name, district_id, districts ( name )")
        .order("name"),
    ]);
    if (pRes.error) throw new Error(pRes.error.message);
    if (lRes.error) throw new Error(lRes.error.message);

    const reps = (pRes.data ?? []) as FieldRep[];
    setFieldReps(reps);
    setLocals(((lRes.data ?? []) as unknown) as LocalOption[]);
    setSelectedRepId((prev) =>
      prev && reps.some((x) => x.id === prev) ? prev : reps[0]?.id ?? ""
    );
  }, [canAssignReps]);

  const loadAll = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      if (isSuper) await loadStaff();
      if (canAssignReps) await loadFieldReps();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isSuper, canAssignReps, loadStaff, loadFieldReps]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, catalogRevision, peopleRevision]);

  useEffect(() => {
    setLocalQuery("");
    setDistrictFilterId("all");
  }, [selectedRepId]);

  useEffect(() => {
    if (!selectedRepId || !canAssignReps) return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("local_assignments")
        .select("local_id")
        .eq("user_id", selectedRepId);
      if (cancelled || error) return;
      setAssignedLocals(
        new Set((data ?? []).map((r) => (r as { local_id: string }).local_id))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRepId, canAssignReps]);

  async function saveStaff(userId: string) {
    if (!isSuper) return;
    setErr(null);
    setMsg(null);
    setSavingStaffId(userId);
    try {
      const supabase = createSupabaseClient();
      const newRole = roleDraft[userId];
      if (!newRole) throw new Error("Missing role");

      const { error: uErr } = await supabase
        .from("profiles")
        .update({ role: newRole } as never)
        .eq("id", userId);
      if (uErr) throw new Error(uErr.message);

      if (newRole === "regional_director") {
        const selected = districtDraft[userId] ?? new Set<string>();
        const { error: delErr } = await supabase
          .from("regional_director_districts")
          .delete()
          .eq("user_id", userId);
        if (delErr) throw new Error(delErr.message);
        if (selected.size > 0) {
          const { error: insErr } = await supabase
            .from("regional_director_districts")
            .insert(
              [...selected].map((district_id) => ({
                user_id: userId,
                district_id,
              })) as never
            );
          if (insErr) throw new Error(insErr.message);
        }
      }

      await loadStaff();
      if (canAssignReps) await loadFieldReps();
      setMsg("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingStaffId(null);
    }
  }

  function toggleDistrict(userId: string, districtId: string) {
    setDistrictDraft((prev) => {
      const next = { ...prev };
      const cur = new Set(next[userId] ?? rddMap.get(userId) ?? new Set());
      if (cur.has(districtId)) cur.delete(districtId);
      else cur.add(districtId);
      next[userId] = cur;
      return next;
    });
  }

  async function saveRepAssignments() {
    if (!selectedRepId || locals.length === 0) return;
    setErr(null);
    setMsg(null);
    setSavingReps(true);
    try {
      const supabase = createSupabaseClient();
      const scopeIds = locals.map((l) => l.id);
      const { error: delErr } = await supabase
        .from("local_assignments")
        .delete()
        .eq("user_id", selectedRepId)
        .in("local_id", scopeIds);
      if (delErr) throw new Error(delErr.message);

      const toAdd = [...assignedLocals].filter((id) => scopeIds.includes(id));
      if (toAdd.length > 0) {
        const { error: insErr } = await supabase.from("local_assignments").insert(
          toAdd.map((local_id) => ({
            user_id: selectedRepId,
            local_id,
          })) as never
        );
        if (insErr) throw new Error(insErr.message);
      }
      setMsg("Assignments saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingReps(false);
    }
  }

  function toggleLocal(localId: string) {
    setAssignedLocals((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  }

  const districtsInScope = useMemo(() => {
    const byId = new Map<string, string>();
    for (const l of locals) {
      const dn = districtNameFromEmbed(l.districts);
      byId.set(l.district_id, dn);
    }
    return [...byId.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }))
      .map(([id, name]) => ({ id, name }));
  }, [locals]);

  const filteredLocals = useMemo(() => {
    let list = locals;
    if (districtFilterId !== "all") {
      list = list.filter((l) => l.district_id === districtFilterId);
    }
    const q = localQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((l) => localSearchText(l).includes(q));
    }
    return list;
  }, [locals, districtFilterId, localQuery]);

  const assignedLocalRows = useMemo(() => {
    const set = assignedLocals;
    const rows = locals.filter((l) => set.has(l.id));
    rows.sort((a, b) =>
      localLabel(a).localeCompare(localLabel(b), undefined, { sensitivity: "base" })
    );
    return rows;
  }, [locals, assignedLocals]);

  function selectAllFiltered() {
    setAssignedLocals((prev) => {
      const next = new Set(prev);
      for (const l of filteredLocals) next.add(l.id);
      return next;
    });
  }

  function clearFiltered() {
    const ids = new Set(filteredLocals.map((l) => l.id));
    setAssignedLocals((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  if (loading) {
    return (
      <Card>
        <div className="px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-slate-900">
            People &amp; access
          </h2>
          <p className="mt-2 text-sm text-slate-600">Loading…</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-slate-900">
          People &amp; access
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {isSuper
            ? "Set staff roles and regional director districts. Assign field reps to locals."
            : "Assign field reps to locals in your districts."}
        </p>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        {err ? (
          <p className="text-sm text-red-600" role="alert">
            {err}
          </p>
        ) : null}
        {msg ? (
          <p className="text-sm text-emerald-700" role="status">
            {msg}
          </p>
        ) : null}

        {isSuper ? (
          <section aria-labelledby="staff-roles-heading">
            <h3
              id="staff-roles-heading"
              className="text-sm font-semibold text-slate-800"
            >
              Staff roles
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Only super admins can change roles and RD districts.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[min(100%,36rem)] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {profiles.map((p) => {
                    const draftRole = roleDraft[p.id] ?? p.role;
                    const dSet =
                      districtDraft[p.id] ??
                      rddMap.get(p.id) ??
                      new Set<string>();
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {p.display_name?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={draftRole}
                            onChange={(e) =>
                              setRoleDraft((prev) => ({
                                ...prev,
                                [p.id]: e.target.value as AppRole,
                              }))
                            }
                            className="w-full min-w-[10rem] max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-slate-900"
                          >
                            <option value="field_rep">
                              {formatAppRole("field_rep")}
                            </option>
                            <option value="regional_director">
                              {formatAppRole("regional_director")}
                            </option>
                            <option value="super_admin">
                              {formatAppRole("super_admin")}
                            </option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {draftRole === "regional_director" ? (
                            <details className="group">
                              <summary className="cursor-pointer list-none text-slate-700 underline decoration-slate-300 underline-offset-2 marker:hidden [&::-webkit-details-marker]:hidden">
                                <span className="text-xs font-medium text-slate-600">
                                  {dSet.size} district
                                  {dSet.size === 1 ? "" : "s"}
                                </span>
                              </summary>
                              <div className="mt-2 max-h-36 overflow-y-auto rounded border border-slate-100 bg-slate-50/80 p-2">
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                  {districts.map((d) => (
                                    <label
                                      key={d.id}
                                      className="flex cursor-pointer items-center gap-2 text-xs text-slate-800"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={dSet.has(d.id)}
                                        onChange={() =>
                                          toggleDistrict(p.id, d.id)
                                        }
                                        className="rounded border-slate-300"
                                      />
                                      {d.name}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </details>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={savingStaffId === p.id}
                            onClick={() => void saveStaff(p.id)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {savingStaffId === p.id ? "…" : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {canAssignReps ? (
          <section
            className={isSuper ? "border-t border-slate-100 pt-6" : ""}
            aria-labelledby="field-rep-heading"
          >
            <h3
              id="field-rep-heading"
              className="text-sm font-semibold text-slate-800"
            >
              Field rep ↔ locals
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Super admins see all locals; regional directors only see locals in
              their assigned districts. Search and filter by district, then tick
              locals or use bulk actions on the current list.
            </p>
            {fieldReps.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No field reps yet.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                  <div className="min-w-0 flex-1 sm:max-w-md">
                    <label
                      htmlFor="admin-field-rep"
                      className="block text-xs font-medium text-slate-600"
                    >
                      Field rep
                    </label>
                    <select
                      id="admin-field-rep"
                      value={selectedRepId}
                      onChange={(e) => setSelectedRepId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {fieldReps.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name?.trim() || p.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={savingReps || !selectedRepId}
                    onClick={() => void saveRepAssignments()}
                    className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingReps ? "Saving…" : "Save locals"}
                  </button>
                </div>
                {selectedRepId && locals.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-xs font-medium text-slate-600">
                        Assigned to this rep
                      </p>
                      {assignedLocalRows.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">
                          None yet — add locals below.
                        </p>
                      ) : (
                        <div className="mt-2 max-h-28 overflow-y-auto">
                          <ul className="flex flex-wrap gap-1.5" aria-label="Assigned locals">
                            {assignedLocalRows.map((loc) => (
                              <li key={loc.id}>
                                <button
                                  type="button"
                                  onClick={() => toggleLocal(loc.id)}
                                  className="group inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-xs text-slate-800 hover:border-slate-300 hover:bg-slate-100"
                                  title="Click to remove"
                                >
                                  <span className="truncate">{localLabel(loc)}</span>
                                  <span
                                    className="shrink-0 text-slate-400 group-hover:text-slate-600"
                                    aria-hidden
                                  >
                                    ×
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        {assignedLocalRows.length} of {locals.length} in scope
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor="locals-search"
                            className="block text-xs font-medium text-slate-600"
                          >
                            Search locals
                          </label>
                          <input
                            id="locals-search"
                            type="search"
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            placeholder="Name or district…"
                            autoComplete="off"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        </div>
                        <div className="sm:w-56">
                          <label
                            htmlFor="locals-district-filter"
                            className="block text-xs font-medium text-slate-600"
                          >
                            District
                          </label>
                          <select
                            id="locals-district-filter"
                            value={districtFilterId}
                            onChange={(e) => setDistrictFilterId(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                          >
                            <option value="all">All districts ({locals.length})</option>
                            {districtsInScope.map((d) => {
                              const count = locals.filter(
                                (l) => l.district_id === d.id
                              ).length;
                              return (
                                <option key={d.id} value={d.id}>
                                  {d.name} ({count})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <p className="text-xs text-slate-600">
                          Showing{" "}
                          <span className="font-medium text-slate-800">
                            {filteredLocals.length}
                          </span>{" "}
                          {filteredLocals.length === locals.length
                            ? "locals"
                            : "matching locals"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={filteredLocals.length === 0}
                            onClick={() => selectAllFiltered()}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Select all shown
                          </button>
                          <button
                            type="button"
                            disabled={filteredLocals.length === 0}
                            onClick={() => clearFiltered()}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Clear shown
                          </button>
                        </div>
                      </div>
                    </div>

                    {filteredLocals.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        No locals match your search or district filter.
                      </p>
                    ) : (
                      <div className="max-h-[min(22rem,50vh)] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <ul className="space-y-0 divide-y divide-slate-100/80">
                          {filteredLocals.map((loc) => (
                            <li key={loc.id} className="py-2 first:pt-0 last:pb-0">
                              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={assignedLocals.has(loc.id)}
                                  onChange={() => toggleLocal(loc.id)}
                                  className="mt-0.5 shrink-0 rounded border-slate-300"
                                />
                                <span className="min-w-0 leading-snug">
                                  {localLabel(loc)}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
                {selectedRepId && locals.length === 0 ? (
                  <p className="mt-3 text-sm text-amber-800">
                    No locals visible. Regional directors need districts assigned
                    under Staff roles first.
                  </p>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { DELETE_USER_CONFIRMATION_PHRASE } from "@/lib/admin-delete-user-constants";
import { formatAppRole } from "@/lib/profiles";
import { createSupabaseClient } from "@/lib/supabase";
import type { AppRole } from "@/types/database";

type ProfilePick = {
  id: string;
  display_name: string | null;
  role: AppRole;
};

export function AdminDeleteUserPanel({
  currentUserId,
  onRemoved,
}: {
  currentUserId: string;
  onRemoved?: () => void;
}) {
  const [rows, setRows] = useState<ProfilePick[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [understand, setUnderstand] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, role")
        .order("display_name", { ascending: true });
      if (error) throw new Error(error.message);
      setRows((data ?? []) as ProfilePick[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit =
    Boolean(selectedId) &&
    selectedId !== currentUserId &&
    understand &&
    confirmText === DELETE_USER_CONFIRMATION_PHRASE;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || deleting) return;
    setErr(null);
    setMsg(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedId,
          confirmation: DELETE_USER_CONFIRMATION_PHRASE,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErr(json.error ?? "Delete failed.");
        return;
      }
      setMsg("User removed from authentication.");
      setSelectedId("");
      setUnderstand(false);
      setConfirmText("");
      onRemoved?.();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const options = rows.filter((r) => r.id !== currentUserId);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 px-4 py-4">
      <h3 className="text-sm font-semibold text-red-950">
        Remove user permanently
      </h3>
      <p className="mt-2 text-sm text-red-950/90">
        This deletes the account in Supabase Auth and the profile row. It does{" "}
        <strong>not</strong> delete locals, bargaining units, negotiations, or
        contract content. Field rep assignments and regional director district
        links for this user are removed. Master contract &quot;created by&quot;
        may be cleared. This cannot be undone.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Loading users…</p>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={(e) => void submit(e)}>
          <div>
            <label
              htmlFor="admin-delete-user"
              className="block text-xs font-medium text-slate-700"
            >
              User to remove
            </label>
            <select
              id="admin-delete-user"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Select a user…</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name?.trim() || p.id} · {formatAppRole(p.role)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={understand}
              onChange={(e) => setUnderstand(e.target.checked)}
              className="mt-0.5 rounded border-slate-300"
            />
            <span>
              I understand this permanently removes their login and profile, and
              that organization data (locals, negotiations) is kept.
            </span>
          </label>

          <div>
            <label
              htmlFor="admin-delete-confirm"
              className="block text-xs font-medium text-slate-700"
            >
              Type{" "}
              <code className="rounded bg-white px-1 py-0.5 text-slate-900">
                {DELETE_USER_CONFIRMATION_PHRASE}
              </code>{" "}
              to enable delete
            </label>
            <input
              id="admin-delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
              placeholder={DELETE_USER_CONFIRMATION_PHRASE}
            />
          </div>

          {err ? (
            <p className="text-sm text-red-700" role="alert">
              {err}
            </p>
          ) : null}
          {msg ? (
            <p className="text-sm text-emerald-800" role="status">
              {msg}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || deleting}
            className="rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Delete user permanently"}
          </button>
        </form>
      )}
    </div>
  );
}

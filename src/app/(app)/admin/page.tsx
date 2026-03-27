"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatAppRole, fetchMyProfile } from "@/lib/profiles";
import { labelsFromLocalRelation } from "@/lib/supabase-embeds";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { AppRole } from "@/types/database";

type LocalOption = { id: string; label: string };

type LocalRowWithDistrict = {
  id: string;
  name: string;
  districts: { name: string } | { name: string }[] | null;
};

type MasterListRow = {
  id: string;
  version_number: number;
  created_at: string;
  file_name: string | null;
  locals: {
    name: string;
    districts: { name: string } | { name: string }[] | null;
  } | null;
};

function masterRowLabel(row: MasterListRow): string {
  const { localName, districtName } = labelsFromLocalRelation(row.locals);
  return `${localName} · ${districtName}`;
}

export default function AdminPage() {
  const supabaseOn = isSupabaseConfigured();
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(supabaseOn);

  const [locals, setLocals] = useState<LocalOption[]>([]);
  const [localId, setLocalId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("field_rep");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const [masters, setMasters] = useState<MasterListRow[]>([]);
  const [mastersErr, setMastersErr] = useState<string | null>(null);
  const [localListErr, setLocalListErr] = useState<string | null>(null);
  const [masterListKey, setMasterListKey] = useState(0);

  useEffect(() => {
    if (!supabaseOn) {
      setRoleLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseClient();
        const profile = await fetchMyProfile(supabase);
        if (!cancelled) setRole(profile?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseOn]);

  useEffect(() => {
    if (!supabaseOn || role !== "super_admin") return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("locals")
        .select("id, name, districts ( name )")
        .order("name");
      if (cancelled) return;
      if (error) {
        setLocalListErr(error.message);
        return;
      }
      setLocalListErr(null);
      const rows = (data ?? []) as LocalRowWithDistrict[];
      const list: LocalOption[] = rows.map((row) => {
        const { localName, districtName } = labelsFromLocalRelation({
          name: row.name,
          districts: row.districts,
        });
        return { id: row.id, label: `${localName} · ${districtName}` };
      });
      setLocals(list);
      setLocalId((prev) => prev || list[0]?.id || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseOn, role]);

  useEffect(() => {
    if (!supabaseOn || role !== "super_admin") return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("master_contracts")
        .select(
          `
          id,
          version_number,
          created_at,
          file_name,
          locals ( name, districts ( name ) )
        `
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (error) {
        setMastersErr(error.message);
        setMasters([]);
        return;
      }
      setMastersErr(null);
      setMasters((data ?? []) as MasterListRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseOn, role, masterListKey]);

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadMsg(null);
    setUploadErr(null);
    if (!file) {
      setUploadErr("Choose a .txt file.");
      return;
    }
    if (!localId) {
      setUploadErr("Select a local.");
      return;
    }
    setUploading(true);
    try {
      const bodyText = await file.text();
      const res = await fetch("/api/admin/master-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId,
          bodyText,
          fileName: file.name,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        version_number?: number;
      };
      if (!res.ok) {
        setUploadErr(json.error ?? "Upload failed.");
        return;
      }
      setUploadMsg(`Saved as version ${json.version_number ?? "?"}.`);
      setFile(null);
      setMasterListKey((k) => k + 1);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg(null);
    setInviteErr(null);
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteErr("Enter an email address.");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setInviteErr(json.error ?? "Invite failed.");
        return;
      }
      setInviteMsg(
        "Invitation sent. They can finish sign-up from the email link."
      );
      setInviteEmail("");
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : "Invite failed.");
    } finally {
      setInviting(false);
    }
  }

  if (!supabaseOn) {
    return (
      <>
        <PageHeader
          title="Admin"
          description="Super-admin tools require a configured Supabase project."
        />
        <Card>
          <p className="text-sm text-slate-600">
            This environment is running without Supabase credentials. Connect
            the app to Supabase to use master contract uploads and user
            invitations.
          </p>
        </Card>
      </>
    );
  }

  if (roleLoading) {
    return (
      <>
        <PageHeader title="Admin" description="Checking your access…" />
        <Card>
          <p className="text-sm text-slate-600">Loading…</p>
        </Card>
      </>
    );
  }

  if (role !== "super_admin") {
    return (
      <>
        <PageHeader
          title="Admin"
          description="Restricted to super administrators."
        />
        <Card>
          <p className="text-sm text-slate-600">
            {role
              ? `You are signed in as ${formatAppRole(role)}. Only super admins can open this page.`
              : "Sign in with a super admin account to use these tools."}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Upload master agreement text and invite staff. Service role key is required on the server for invitations."
      />

      <div className="space-y-8">
        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            Master contract (.txt)
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Plain text is converted to HTML (paragraphs and line breaks) and
            stored as a new immutable version for the selected local.
          </p>
          <form className="mt-6 space-y-4" onSubmit={(e) => void submitUpload(e)}>
            {localListErr ? (
              <p className="text-sm text-red-600" role="alert">
                Could not load locals: {localListErr}
              </p>
            ) : null}
            <div>
              <label
                htmlFor="admin-local"
                className="block text-sm font-medium text-slate-700"
              >
                Local
              </label>
              <select
                id="admin-local"
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              >
                {locals.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="admin-txt"
                className="block text-sm font-medium text-slate-700"
              >
                Text file
              </label>
              <input
                id="admin-txt"
                type="file"
                accept=".txt,text/plain"
                className="mt-1 block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800"
                onChange={(e) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />
            </div>
            {uploadErr ? (
              <p className="text-sm text-red-600" role="alert">
                {uploadErr}
              </p>
            ) : null}
            {uploadMsg ? (
              <p className="text-sm text-emerald-700" role="status">
                {uploadMsg}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload and save version"}
            </button>
          </form>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            Invite user
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Sends a Supabase invite email. Set{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            on the server and add your site URL to Supabase Auth redirect
            allowlist.
          </p>
          <form className="mt-6 space-y-4" onSubmit={(e) => void submitInvite(e)}>
            <div>
              <label
                htmlFor="admin-email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              />
            </div>
            <div>
              <label
                htmlFor="admin-role"
                className="block text-sm font-medium text-slate-700"
              >
                Role after sign-up
              </label>
              <select
                id="admin-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as AppRole)}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
              >
                <option value="field_rep">{formatAppRole("field_rep")}</option>
                <option value="regional_director">
                  {formatAppRole("regional_director")}
                </option>
                <option value="super_admin">
                  {formatAppRole("super_admin")}
                </option>
              </select>
            </div>
            {inviteErr ? (
              <p className="text-sm text-red-600" role="alert">
                {inviteErr}
              </p>
            ) : null}
            {inviteMsg ? (
              <p className="text-sm text-emerald-700" role="status">
                {inviteMsg}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </form>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            Recent master uploads
          </h2>
          {mastersErr ? (
            <p className="mt-4 text-sm text-red-600">{mastersErr}</p>
          ) : masters.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No uploads yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {masters.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                >
                  <span className="font-medium text-slate-800">
                    {masterRowLabel(m)}
                  </span>
                  <span className="text-slate-500">
                    v{m.version_number}
                    {m.file_name ? ` · ${m.file_name}` : ""} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

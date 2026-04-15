"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  formatAppRole,
  fetchMyProfile,
} from "@/lib/profiles";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { AppRole } from "@/types/database";

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconMap({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v4" />
    </svg>
  );
}

function IconNegotiations({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function IconNotes({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

function IconDocuments({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M8 11h8" />
      <path d="M8 15h6" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconAgreements({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </svg>
  );
}

const nav = [
  { href: "/", label: "Dashboard", Icon: IconDashboard },
  { href: "/proposals", label: "Proposals", Icon: IconDoc },
  { href: "/sessions", label: "Bargaining sessions", Icon: IconCalendar },
  { href: "/districts", label: "Districts", Icon: IconMap },
  { href: "/locals", label: "Locals", Icon: IconUsers },
  { href: "/bargaining-units", label: "Bargaining units", Icon: IconBriefcase },
  { href: "/contracts", label: "Agreements", Icon: IconAgreements },
  { href: "/negotiations", label: "Negotiations", Icon: IconNegotiations },
  { href: "/notes", label: "Notes", Icon: IconNotes },
  { href: "/documents", label: "Documents", Icon: IconDocuments },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const authEnabled = isSupabaseConfigured();
  const [appRole, setAppRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseClient();
        const profile = await fetchMyProfile(supabase);
        if (!cancelled && profile) setAppRole(profile.role);
      } catch {
        if (!cancelled) setAppRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authEnabled]);

  async function handleSignOut() {
    if (!authEnabled) return;
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-sidebar text-slate-100 print:hidden">
      <div className="border-b border-slate-800 px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Union platform
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-white">
          Negotiations
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Main">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const { Icon } = item;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-700/80 text-white"
                  : "text-slate-300 hover:bg-sidebar-accent hover:text-white"
              }`}
            >
              <Icon
                className={
                  active ? "text-slate-200" : "text-slate-500"
                }
              />
              {item.label}
            </Link>
          );
        })}
        {appRole === "super_admin" || appRole === "regional_director" ? (
          <Link
            href="/admin"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/admin")
                ? "bg-slate-700/80 text-white"
                : "text-slate-300 hover:bg-sidebar-accent hover:text-white"
            }`}
          >
            <IconShield
              className={
                pathname.startsWith("/admin")
                  ? "text-slate-200"
                  : "text-slate-500"
              }
            />
            Admin
          </Link>
        ) : null}
      </nav>
      <div className="border-t border-slate-800 p-4 text-xs text-slate-500">
        {authEnabled ? (
          <div className="space-y-2">
            {appRole ? (
              <p className="text-[11px] leading-snug text-slate-400">
                Signed in as{" "}
                <span className="font-medium text-slate-300">
                  {formatAppRole(appRole)}
                </span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/80 hover:text-white"
            >
              Sign out
            </button>
          </div>
        ) : (
          <p>Mock data · Internal use</p>
        )}
      </div>
    </aside>
  );
}

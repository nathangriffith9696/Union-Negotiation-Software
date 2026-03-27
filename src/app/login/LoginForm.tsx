"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import {
  createSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next")?.trim() || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"magic" | "password" | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  if (!isSupabaseConfigured()) {
    return (
      <Card className="mx-auto max-w-md p-8 shadow-md">
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Supabase is not configured. Add{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to <code className="text-xs">.env.local</code>, then restart the dev
          server.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-slate-900 underline"
        >
          Continue to app (mock mode)
        </Link>
      </Card>
    );
  }

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading("magic");
    try {
      const supabase = createSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setMessage(
        "Check your email for the sign-in link. You can close this tab after you click it."
      );
    } finally {
      setLoading(null);
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const emailVal = (
      emailInputRef.current?.value ??
      email
    ).trim();
    const pwd = (passwordInputRef.current?.value ?? password).trim();
    if (!emailVal) {
      setError("Enter your email in the field above.");
      return;
    }
    if (!pwd) {
      setError("Enter your password.");
      return;
    }
    setLoading("password");
    try {
      const supabase = createSupabaseClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: emailVal,
        password: pwd,
      });
      if (err) {
        setError(err.message);
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="mx-auto max-w-md p-8 shadow-md">
      <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Use your work email. Magic link is recommended; password works only if
        enabled in Supabase.
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      <form
        method="post"
        onSubmit={sendMagicLink}
        className="mt-6 space-y-4"
      >
        <div>
          <label
            htmlFor="login-email"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Email
          </label>
          <input
            ref={emailInputRef}
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onInput={(e) => setEmail(e.currentTarget.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
          />
        </div>
        <button
          type="submit"
          disabled={loading !== null}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "magic" ? "Sending…" : "Email me a magic link"}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide text-slate-400">
          <span className="bg-white px-2">Or</span>
        </div>
      </div>

      <form
        method="post"
        onSubmit={signInWithPassword}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="login-password"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Password
          </label>
          <input
            ref={passwordInputRef}
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInput={(e) => setPassword(e.currentTarget.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
          />
        </div>
        <button
          type="submit"
          disabled={loading !== null}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "password" ? "Signing in…" : "Sign in with password"}
        </button>
      </form>
    </Card>
  );
}

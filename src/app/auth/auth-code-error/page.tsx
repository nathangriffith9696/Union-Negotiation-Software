import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <Card className="mx-auto max-w-md p-8 shadow-md">
        <h1 className="text-lg font-semibold text-slate-900">
          Sign-in link did not work
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The link may have expired, or the URL configuration in Supabase does
          not match this app. Check{" "}
          <strong>Authentication → URL configuration</strong> and add this
          redirect URL:{" "}
          <code className="text-xs">
            http://localhost:3000/auth/callback
          </code>
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-slate-900 underline"
        >
          Back to sign in
        </Link>
      </Card>
    </div>
  );
}

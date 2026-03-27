import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <Suspense
        fallback={
          <div className="text-sm text-slate-600">Loading sign-in…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

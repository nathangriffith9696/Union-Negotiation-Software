import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <header className="mb-8 border-b border-slate-200 pb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      {description != null && description !== "" ? (
        <div className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          {description}
        </div>
      ) : null}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-surface-card p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

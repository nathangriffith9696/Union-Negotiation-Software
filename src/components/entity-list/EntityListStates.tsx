import { Card } from "@/components/ui/Card";

export type EntityListStatus = "loading" | "ready" | "empty" | "error";

export function ListLoadingCard({ noun }: { noun: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-600">Loading {noun}…</p>
    </Card>
  );
}

export function ListErrorCard({
  noun,
  message,
}: {
  noun: string;
  message: string;
}) {
  return (
    <Card className="border-red-200 bg-red-50/80">
      <p className="text-sm font-medium text-red-900">
        Could not load {noun}
      </p>
      <p className="mt-2 text-sm text-red-800/90">{message}</p>
    </Card>
  );
}

export function ListEmptyCard({ noun }: { noun: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-600">
        No {noun} yet. Add rows in Supabase or use mock data by leaving env vars
        unset.
      </p>
    </Card>
  );
}

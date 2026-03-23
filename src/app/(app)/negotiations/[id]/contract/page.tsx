"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

const ContractEditorPanel = dynamic(
  () =>
    import("@/components/contract/ContractEditorPanel").then(
      (m) => m.ContractEditorPanel
    ),
  {
    ssr: false,
    loading: () => (
      <>
        <PageHeader title="Contract editor" description="Loading…" />
        <Card>
          <p className="text-sm text-slate-600">Loading editor…</p>
        </Card>
      </>
    ),
  }
);

export default function NegotiationContractPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  return <ContractEditorPanel negotiationId={id} />;
}

import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface print:bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col print:min-h-0">
        <main className="flex-1 overflow-auto px-8 py-8 print:px-6 print:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}

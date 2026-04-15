import Sidebar from "@/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-6 pt-16 lg:pt-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

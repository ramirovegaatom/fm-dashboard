import Link from "next/link";
import { SyncButton } from "../SyncButton";
import { TabNav } from "./TabNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="dashboard-container">
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Link href="/" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "inherit", textDecoration: "none" }}>
            Field Marketing Dashboard
          </Link>
          <SyncButton />
        </div>
        <TabNav />
      </header>
      {children}
    </main>
  );
}

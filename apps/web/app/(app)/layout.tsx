"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  const isChatPage = pathname === "/chat";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className={`flex-1 overflow-y-auto ${isChatPage ? "" : "p-4 pt-14 lg:p-8 lg:pt-8"}`}>
        {children}
      </main>
    </div>
  );
}

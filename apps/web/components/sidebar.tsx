"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Bell,
  LogOut,
  Package,
  BarChart3,
  MessageSquare,
  TrendingUp,
  Menu,
  X,
  Building2,
  CreditCard,
  Target,
  Store,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Facturas", icon: FileText },
  { href: "/suppliers", label: "Proveedores", icon: Building2 },
  { href: "/payments", label: "Cuentas por Pagar", icon: CreditCard },
  { href: "/margin", label: "Control de Margen", icon: Target },
  { href: "/branches", label: "Sucursales y Ventas", icon: Store },
  { href: "/prices", label: "Precios", icon: TrendingUp },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/chat", label: "Savia AI", icon: MessageSquare },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const navContent = (
    <>
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Package className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">Savia</span>
        <button
          className="ml-auto p-1 rounded-md hover:bg-muted lg:hidden"
          onClick={() => setOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-background border shadow-sm lg:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex-col bg-card border-r transform transition-transform duration-200 ease-in-out lg:hidden flex",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex h-screen w-64 flex-col border-r bg-card flex-shrink-0">
        {navContent}
      </aside>
    </>
  );
}

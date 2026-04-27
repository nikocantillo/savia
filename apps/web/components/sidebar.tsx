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
  Brain,
  Bot,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/invoices", label: "Facturas", icon: FileText },
  { href: "/suppliers", label: "Proveedores", icon: Building2 },
  { href: "/payments", label: "Cuentas por Pagar", icon: CreditCard },
  { href: "/margin", label: "Control de Margen", icon: Target },
  { href: "/branches", label: "Sucursales y Ventas", icon: Store },
  { href: "/prices", label: "Precios", icon: TrendingUp },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/agents", label: "Agentes", icon: Bot },
  { href: "/chat", label: "Sabia IA", icon: MessageSquare },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      setUserName(u.full_name || "");
      setUserEmail(u.email || "");
    } catch {}
  }, []);

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
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-brand shadow-md shadow-primary/20">
          <Brain className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold gradient-text">Sabia AI</span>
        <button
          className="ml-auto p-1 rounded-md hover:bg-muted lg:hidden"
          onClick={() => setOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "gradient-brand-subtle text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
              {item.label}
              {active && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 space-y-2">
        {userName && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-brand text-white text-xs font-bold shrink-0">
              {userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
            <ThemeToggle />
          </div>
        )}
        {!userName && (
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 p-2 rounded-xl bg-background/80 backdrop-blur-sm border shadow-sm lg:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
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

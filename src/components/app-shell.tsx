import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Youtube, DollarSign, CreditCard, FileText, FileSpreadsheet, LogOut, Menu, UserPlus, Settings, ShieldCheck, Receipt } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/brand";
import type { AppRole } from "@/hooks/use-auth";

const staffNav = [
  { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { to: "/clients", label: "العملاء", icon: Users },
  { to: "/channels", label: "القنوات", icon: Youtube },
  { to: "/revenue", label: "الإيرادات الشهرية", icon: DollarSign },
  { to: "/invoices", label: "الفواتير", icon: FileText },
  { to: "/payments", label: "المدفوعات", icon: CreditCard },
  { to: "/receipts", label: "إيصالات الدفع", icon: Receipt },
  { to: "/statements", label: "كشوف الحساب", icon: FileSpreadsheet },
  { to: "/reports", label: "التقارير", icon: FileText },
];

const adminExtras = [
  { to: "/users", label: "المستخدمون", icon: UserPlus },
  { to: "/permissions", label: "الصلاحيات", icon: ShieldCheck },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

const clientNav = [
  { to: "/dashboard", label: "لوحتي", icon: LayoutDashboard },
  { to: "/channels", label: "قنواتي", icon: Youtube },
  { to: "/revenue", label: "إيراداتي", icon: DollarSign },
  { to: "/invoices", label: "فواتيري", icon: FileText },
  { to: "/payments", label: "مدفوعاتي", icon: CreditCard },
  { to: "/receipts", label: "إيصالاتي", icon: Receipt },
  { to: "/statements", label: "كشف الحساب", icon: FileSpreadsheet },
  { to: "/reports", label: "تقاريري", icon: FileText },
];

export function AppShell({ children, roles, email }: { children: ReactNode; roles: AppRole[]; email?: string | null }) {
  const isAdmin = roles.includes("admin");
  const isStaff = isAdmin || roles.includes("employee");
  const nav = isStaff ? (isAdmin ? [...staffNav, ...adminExtras] : staffNav) : clientNav;
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roleLabel = isAdmin ? "مسؤول" : roles.includes("employee") ? "موظف" : "عميل";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile Sidebar backdrop */}
      {open && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed lg:static inset-y-0 right-0 z-40 w-64 bg-sidebar border-l border-sidebar-border flex flex-col transition-transform print:hidden",
        open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        <div className="p-5 border-b border-sidebar-border">
          <Brand size="lg" />
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = loc.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs text-muted-foreground">{roleLabel}</div>
            <div className="text-sm font-medium truncate" dir="ltr">{email}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="w-4 h-4 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 print:p-0">
        <header className="lg:hidden flex items-center justify-between p-4 border-b bg-card print:hidden">
          <Button size="icon" variant="ghost" onClick={() => setOpen(!open)}><Menu /></Button>
          <span className="font-extrabold text-white text-base">Orient Digital</span>
          <div className="w-10" />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto print:p-0">{children}</main>
      </div>
    </div>
  );
}

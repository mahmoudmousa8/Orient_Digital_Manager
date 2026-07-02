import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Youtube, DollarSign, CreditCard, FileText, FileSpreadsheet, LogOut, Menu, UserPlus, Settings, ShieldCheck, ClipboardCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/brand";
import type { AppRole } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";

const staffNav = [
  { to: "/dashboard", label: "لوحة التحكم", key: "dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "العملاء", key: "clients", icon: Users },
  { to: "/channels", label: "القنوات", key: "channels", icon: Youtube },
  { to: "/publishing", label: "نشر القنوات", key: "publishing", icon: ClipboardCheck },
  { to: "/revenue", label: "الإيرادات الشهرية", key: "revenue", icon: DollarSign },
  { to: "/invoices", label: "الفواتير", key: "invoices", icon: FileText },
  { to: "/payments", label: "المدفوعات", key: "payments", icon: CreditCard },
  { to: "/statements", label: "كشوف الحساب", key: "statements", icon: FileSpreadsheet },
  { to: "/reports", label: "التقارير", key: "reports", icon: FileText },
];

const adminExtras = [
  { to: "/users", label: "المستخدمون", key: "users", icon: Users },
  { to: "/settings", label: "الإعدادات", key: "settings", icon: Settings },
];

const clientNav = [
  { to: "/dashboard", label: "لوحتي", key: "dashboard", icon: LayoutDashboard },
  { to: "/channels", label: "قنواتي", key: "channels", icon: Youtube },
  { to: "/revenue", label: "إيراداتي", key: "revenue", icon: DollarSign },
  { to: "/invoices", label: "فواتيري", key: "invoices", icon: FileText },
  { to: "/payments", label: "مدفوعاتي", key: "payments", icon: CreditCard },
  { to: "/statements", label: "كشف الحساب", key: "statements", icon: FileSpreadsheet },
  { to: "/reports", label: "تقاريري", key: "reports", icon: FileText },
];

export function AppShell({ children, roles, email }: { children: ReactNode; roles: AppRole[]; email?: string | null }) {
  const { lang, setLang, t } = useLanguage();
  const isAdmin = roles.includes("admin");
  const isEmployee = roles.includes("employee") && !isAdmin;
  const nav = isAdmin
    ? [...staffNav, ...adminExtras]
    : isEmployee
    ? [
        { to: "/channels", label: "القنوات", key: "channels", icon: Youtube },
        { to: "/publishing", label: "نشر القنوات", key: "publishing", icon: ClipboardCheck },
      ]
    : clientNav;
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roleLabel = lang === "ar" 
    ? (isAdmin ? "مسؤول" : roles.includes("employee") ? "موظف" : "عميل") 
    : (isAdmin ? "Admin" : roles.includes("employee") ? "Employee" : "Client");

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
        "fixed lg:sticky top-0 inset-y-0 z-40 w-64 h-screen bg-sidebar flex flex-col transition-transform print:hidden",
        "right-0 border-l border-sidebar-border",
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
                {item.key ? t(item.key) : item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center border-slate-800 hover:bg-slate-900 text-slate-200"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            🌐 {lang === "ar" ? "English" : "العربية"}
          </Button>
          <div className="px-3 py-1 text-center flex flex-col items-center justify-center">
            <div className="text-xs text-muted-foreground">{roleLabel}</div>
            <div className="text-sm font-medium truncate w-full text-center mt-0.5" dir="ltr">{email}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="w-4 h-4 ml-2" />
            {t("logout")}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 print:p-0">
        <header className="lg:hidden flex items-center justify-between p-4 border-b bg-card print:hidden">
          <Button size="icon" variant="ghost" onClick={() => setOpen(!open)}><Menu /></Button>
          <span className="font-extrabold text-white text-base">{t("brandName")}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-300 hover:text-white"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            {lang === "ar" ? "EN" : "عربي"}
          </Button>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

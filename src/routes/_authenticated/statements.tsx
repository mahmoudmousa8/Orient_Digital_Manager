import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileDown, ExternalLink, RefreshCw } from "lucide-react";
import { money, monthLabel, STATUS_AR } from "@/lib/format";
import { exportStatementPDF, type StatementRow } from "@/lib/exports";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/statements")({
  component: StatementsPage,
});

function firstOfCurrentYear() {
  const y = new Date().getFullYear();
  return `${y}-01`;
}

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function StatementsPage() {
  const { t, lang } = useLanguage();
  const { isStaff, user } = useAuth();
  const [clientId, setClientId] = useState<string>("");
  const [startMonth, setStartMonth] = useState<string>(firstOfCurrentYear());
  const [endMonth, setEndMonth] = useState<string>(currentMonthStr());

  // Queries
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min-all"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, email, phone, vodafone_cash, user_id").order("name");
      return (data ?? []) as any[];
    },
  });

  // Automatically select client for non-staff or default first client for staff
  useEffect(() => {
    if (!isStaff && clients.length && user) {
      const selfClient = clients.find((c) => c.user_id === user.id);
      if (selfClient) setClientId(selfClient.id);
    } else if (isStaff && !clientId && clients.length) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId, isStaff, user]);

  const client = clients.find((c) => c.id === clientId);

  // 1. Fetch Opening Balance: Remaining balance of all payments before startMonth
  const { data: openingBalance = 0, isLoading: loadingOpening } = useQuery({
    queryKey: ["opening-balance", clientId, startMonth],
    enabled: !!clientId && !!startMonth,
    queryFn: async () => {
      const start = startMonth + "-01";
      const { data, error } = await supabase
        .from("payments")
        .select(`
          remaining,
          monthly_revenues!inner(period_month, channels!inner(client_id))
        `)
        .eq("monthly_revenues.channels.client_id", clientId)
        .lt("monthly_revenues.period_month", start);
      
      if (error) throw error;
      return (data ?? []).reduce((sum, p: any) => sum + Number(p.remaining || 0), 0);
    },
  });

  // 2. Fetch Statement Rows in period (sorted ascending for running balance)
  const { data: rawRows = [], isLoading: loadingRows } = useQuery({
    queryKey: ["statement-period", clientId, startMonth, endMonth],
    enabled: !!clientId && !!startMonth && !!endMonth,
    queryFn: async () => {
      const start = startMonth + "-01";
      const end = endMonth + "-01";
      const { data, error } = await supabase
        .from("monthly_revenues")
        .select(`
          period_month, total_revenue, client_percentage, client_share, company_share,
          channels!inner(name, link, client_id),
          payments(status, amount_paid, remaining)
        `)
        .eq("channels.client_id", clientId)
        .gte("period_month", start)
        .lte("period_month", end)
        .order("period_month", { ascending: true });

      if (error) throw error;
      return data as any[];
    },
  });

  const STATUS_EN: Record<string, string> = {
    draft: "Draft",
    issued: "Issued",
    paid: "Paid",
    partial: "Partially Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
    unpaid: "Unpaid"
  };

  // Calculate Running Balance and map statement rows
  const { statementRows, closingBalance } = useMemo(() => {
    let running = openingBalance;
    const rows: Array<StatementRow & { runningBalance: number }> = [];

    rawRows.forEach((r) => {
      const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;
      const clientShare = Number(r.client_share ?? 0);
      const paid = Number(p?.amount_paid ?? 0);
      const remaining = Number(p?.remaining ?? clientShare);
      running = running + clientShare - paid;

      const pStatus = p?.status ?? "unpaid";
      rows.push({
        channel: r.channels?.name ?? "",
        link: r.channels?.link ?? "",
        month: monthLabel(r.period_month),
        revenue: Number(r.total_revenue),
        percentage: Number(r.client_percentage),
        clientShare,
        companyShare: Number(r.company_share ?? 0),
        paymentStatus: lang === "ar" ? STATUS_AR[pStatus] : (STATUS_EN[pStatus] || pStatus),
        amountPaid: paid,
        remaining,
        runningBalance: running,
      });
    });

    return { statementRows: rows, closingBalance: running };
  }, [rawRows, openingBalance, lang]);

  const totals = useMemo(() => ({
    revenue: statementRows.reduce((s, r) => s + r.revenue, 0),
    clientShare: statementRows.reduce((s, r) => s + r.clientShare, 0),
    companyShare: statementRows.reduce((s, r) => s + r.companyShare, 0),
    paid: statementRows.reduce((s, r) => s + r.amountPaid, 0),
    remaining: statementRows.reduce((s, r) => s + r.remaining, 0),
  }), [statementRows]);

  function exportPdf() {
    if (!client) return;
    const periodLabel = `${monthLabel(startMonth + "-01")} — ${monthLabel(endMonth + "-01")}`;
    exportStatementPDF(`statement-${client.name}-${startMonth}_to_${endMonth}.pdf`, {
      clientName: client.name,
      clientEmail: client.email,
      clientPhone: client.phone,
      vodafoneCash: client.vodafone_cash,
      period: periodLabel,
      rows: statementRows,
      openingBalance,
      closingBalance,
    });
  }

  const isLoading = loadingOpening || loadingRows;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
          <FileSpreadsheet className="w-8 h-8 text-primary" /> 
          {lang === "ar" ? "كشوف الحسابات" : "Account Statements"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {lang === "ar" ? "عرض الأرصدة الافتتاحية، كشف حساب جاري تفصيلي، والرصيد الختامي مع التصدير المباشر" : "View opening balances, detailed current statement, and closing balance with direct export"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang === "ar" ? "تحديد الفترة وتصفية الكشف" : "Filter Statement & Period"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-right">
            {isStaff ? (
              <div className="space-y-2">
                <Label className="text-slate-300">{lang === "ar" ? "العميل" : "Client"}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                    <SelectValue placeholder={lang === "ar" ? "اختر العميل" : "Select client"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-slate-300">{lang === "ar" ? "العميل" : "Client"}</Label>
                <div className="px-3 py-2 border border-slate-700 rounded-md text-sm bg-slate-900 text-white">{client?.name ?? "—"}</div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-300">{lang === "ar" ? "من شهر" : "From Month"}</Label>
              <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} dir="ltr" className="bg-slate-900 border-slate-700 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">{lang === "ar" ? "إلى شهر" : "To Month"}</Label>
              <Input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} dir="ltr" className="bg-slate-900 border-slate-700 text-white" />
            </div>
            <Button onClick={exportPdf} disabled={!statementRows.length || isLoading} className="w-full">
              <FileDown className="w-4 h-4 ml-1" /> {lang === "ar" ? "تصدير كشف PDF" : "Export PDF Statement"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Opening & Closing Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-muted/10 border-slate-800">
          <CardContent className="pt-4 text-center">
            <div className="text-sm text-muted-foreground">{lang === "ar" ? "الرصيد الافتتاحي (السابق)" : "Opening Balance (Previous)"}</div>
            <div className="text-xl font-bold mt-1 text-white" dir="ltr">{money(openingBalance)}</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 text-center">
            <div className="text-sm text-primary">{lang === "ar" ? "صافي أرباح الفترة" : "Net Period Earnings"}</div>
            <div className="text-xl font-bold mt-1 text-white" dir="ltr">{money(totals.clientShare)}</div>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="pt-4 text-center">
            <div className="text-sm text-destructive">{lang === "ar" ? "الرصيد الختامي المستحق" : "Outstanding Closing Balance"}</div>
            <div className="text-xl font-black mt-1 text-white" dir="ltr">{money(closingBalance)}</div>
          </CardContent>
        </Card>
      </div>

      {client && (
        <Card className="border-slate-800">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div className="text-right">
              <div className="text-muted-foreground mb-0.5">{lang === "ar" ? "العميل" : "Client"}</div>
              <div className="font-bold text-white">{client.name}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground mb-0.5">{lang === "ar" ? "البريد" : "Email"}</div>
              <div dir="ltr" className="text-right text-white font-medium">{client.email || "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground mb-0.5">{lang === "ar" ? "الهاتف" : "Phone"}</div>
              <div dir="ltr" className="text-right text-white font-medium">{client.phone || "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground mb-0.5">{lang === "ar" ? "إنستاباي / محفظة" : "InstaPay / Wallet"}</div>
              <div dir="ltr" className="text-right text-white font-medium">{client.vodafone_cash || "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{lang === "ar" ? "الشهر" : "Month"}</TableHead>
                <TableHead className="text-right">{t("channelName")}</TableHead>
                {isStaff && <TableHead className="text-left">{lang === "ar" ? "إجمالي الأرباح" : "Total Profits"}</TableHead>}
                {isStaff && <TableHead className="text-center">{lang === "ar" ? "النسبة" : "Percent"}</TableHead>}
                <TableHead className="text-left">{lang === "ar" ? "صافي حصة العميل" : "Net Client Share"}</TableHead>
                <TableHead className="text-left">{lang === "ar" ? "المدفوع للعميل" : "Paid to Client"}</TableHead>
                <TableHead className="text-left">{lang === "ar" ? "الرصيد المتبقي للشهر" : "Remaining Month Balance"}</TableHead>
                <TableHead className="text-left text-primary font-bold">{lang === "ar" ? "الرصيد الجاري المستحق" : "Current Outstanding"}</TableHead>
                <TableHead className="text-right">{lang === "ar" ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 9 : 7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {lang === "ar" ? "جاري تحميل كشف الحساب…" : "Loading account statement..."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !statementRows.length && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 9 : 7} className="text-center text-muted-foreground py-12">
                    {lang === "ar" ? "لا توجد معاملات مسجلة للفترة المحددة" : "No transactions recorded for the selected period"}
                  </TableCell>
                </TableRow>
              )}
              {statementRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell dir="ltr" className="text-right font-medium">{r.month}</TableCell>
                  <TableCell className="font-semibold text-right">{r.channel}</TableCell>
                  {isStaff && <TableCell dir="ltr" className="text-left text-white">{money(r.revenue)}</TableCell>}
                  {isStaff && <TableCell dir="ltr" className="text-center text-white">{r.percentage}%</TableCell>}
                  <TableCell dir="ltr" className="text-left text-white font-semibold">{money(r.clientShare)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white">{money(r.amountPaid)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white">{money(r.remaining)}</TableCell>
                  <TableCell dir="ltr" className="text-left font-black text-white">{money(r.runningBalance)}</TableCell>
                  <TableCell className="text-right text-white font-medium">{r.paymentStatus}</TableCell>
                </TableRow>
              ))}
              {statementRows.length > 0 && (
                <TableRow className="bg-muted/10 font-bold">
                  <TableCell colSpan={2} className="text-right">{lang === "ar" ? "إجمالي الفترة" : "Period Total"}</TableCell>
                  {isStaff && <TableCell dir="ltr" className="text-left text-white">{money(totals.revenue)}</TableCell>}
                  {isStaff && <TableCell></TableCell>}
                  <TableCell dir="ltr" className="text-left text-white">{money(totals.clientShare)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white">{money(totals.paid)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white">{money(totals.remaining)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white font-black">{money(closingBalance)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

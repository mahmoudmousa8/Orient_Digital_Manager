import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FileSpreadsheet, FileDown, TrendingUp, DollarSign, Clock, Users, ArrowUpRight, BarChart2, ShieldAlert } from "lucide-react";
import { money, monthLabel, STATUS_AR } from "@/lib/format";
import { exportExcel, exportPDF } from "@/lib/exports";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsDashboard,
});

function firstOfCurrentYear() {
  const y = new Date().getFullYear();
  return `${y}-01`;
}

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const COLORS = ["#8b5cf6", "#a21caf", "#3b82f6", "#10b981", "#d946ef", "#f59e0b"];

function ReportsDashboard() {
  const { t, lang } = useLanguage();
  const STATUS_EN: Record<string, string> = {
    draft: "Draft",
    issued: "Issued",
    paid: "Paid",
    partial: "Partially Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
    unpaid: "Unpaid"
  };
  const { isStaff, user, loading: isAuthLoading } = useAuth();
  const [clientId, setClientId] = useState<string>("all");
  const [startMonth, setStartMonth] = useState<string>(firstOfCurrentYear());
  const [endMonth, setEndMonth] = useState<string>(currentMonthStr());

  // 1. Fetch Clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !isAuthLoading && isStaff,
  });

  // 2. Fetch Data for Period
  const { data: reportData, isLoading: isQueryLoading } = useQuery({
    queryKey: ["reports-dashboard-data", user?.id, clientId, startMonth, endMonth, isStaff],
    enabled: !isAuthLoading && (isStaff || !!user?.id),
    queryFn: async () => {
      const start = startMonth + "-01";
      
      // End of period (inclusive) - we want to include all of endMonth, so we get the first day of the next month and do .lt
      const endYear = parseInt(endMonth.split("-")[0]);
      const endMonthNum = parseInt(endMonth.split("-")[1]);
      
      let nextMonthYear = endYear;
      let nextMonthNum = endMonthNum + 1;
      if (nextMonthNum > 12) {
        nextMonthNum = 1;
        nextMonthYear += 1;
      }
      const nextMonthStr = `${nextMonthYear}-${String(nextMonthNum).padStart(2, "0")}-01`;

      // Query revenues
      let revQuery = supabase
        .from("monthly_revenues")
        .select(`
          id, period_month, total_revenue, client_percentage, client_share, company_share, views,
          channels(name, client_id, clients(id, name)),
          payments(status, amount_paid, remaining)
        `)
        .gte("period_month", start)
        .lt("period_month", nextMonthStr);

      // Query invoices
      let invQuery = supabase
        .from("invoices")
        .select("id, invoice_number, issue_date, due_date, status, grand_total, amount_paid, remaining_balance, client_id, clients(name)")
        .gte("issue_date", start)
        .lt("issue_date", nextMonthStr);

      const [revRes, invRes] = await Promise.all([revQuery, invQuery]);
      if (revRes.error) throw revRes.error;
      if (invRes.error) throw invRes.error;

      let revenues = (revRes.data ?? []) as any[];
      let invoices = (invRes.data ?? []) as any[];

      // Filter by client if specified
      if (isStaff && clientId !== "all") {
        revenues = revenues.filter((r) => r.channels?.client_id === clientId);
        invoices = invoices.filter((i) => i.client_id === clientId);
      } else if (!isStaff) {
        // Find self client IDs (for multi-client access support)
        const { data: selfClients } = await supabase.from("clients").select("id").eq("user_id", user?.id || "");
        const clientIds = (selfClients ?? []).map((c) => c.id);
        if (clientIds.length > 0) {
          revenues = revenues.filter((r) => clientIds.includes(r.channels?.client_id));
          invoices = invoices.filter((i) => clientIds.includes(i.client_id));
        } else {
          return { revenues: [], invoices: [] };
        }
      }

      return { revenues, invoices };
    },
  });

  const isLoading = isAuthLoading || isQueryLoading;

  const revenues = reportData?.revenues ?? [];
  const invoices = reportData?.invoices ?? [];

  // 3. Compute Metrics and Charts Data
  const stats = useMemo(() => {
    // Totals from revenues
    const totalGross = revenues.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const totalClientShare = revenues.reduce((s, r) => s + Number(r.client_share || 0), 0);
    const totalCompanyShare = revenues.reduce((s, r) => s + Number(r.company_share || 0), 0);
    
    // Totals from invoices
    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.grand_total || 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
    const totalOutstanding = invoices.reduce((s, i) => s + Number(i.remaining_balance || 0), 0);

    // Invoice Aging calculation
    const now = new Date();
    let overdue1_30 = 0;
    let overdue31_60 = 0;
    let overdue60Plus = 0;
    const agingList: any[] = [];

    invoices.forEach((inv) => {
      if (inv.status !== "paid" && inv.status !== "cancelled" && inv.remaining_balance > 0) {
        const due = new Date(inv.due_date);
        const diffTime = now.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
          if (diffDays <= 30) overdue1_30 += inv.remaining_balance;
          else if (diffDays <= 60) overdue31_60 += inv.remaining_balance;
          else overdue60Plus += inv.remaining_balance;

          agingList.push({
            ...inv,
            overdueDays: diffDays,
          });
        }
      }
    });

    // Top Channels
    const channelMap: Record<string, { name: string; revenue: number }> = {};
    revenues.forEach((r) => {
      const name = r.channels?.name ?? "غير معروف";
      if (!channelMap[name]) channelMap[name] = { name, revenue: 0 };
      channelMap[name].revenue += Number(r.total_revenue || 0);
    });
    const topChannels = Object.values(channelMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Top Clients (for Staff only)
    const clientMap: Record<string, { name: string; revenue: number }> = {};
    revenues.forEach((r) => {
      const name = r.channels?.clients?.name ?? "غير معروف";
      if (!clientMap[name]) clientMap[name] = { name, revenue: 0 };
      clientMap[name].revenue += Number(r.total_revenue || 0);
    });
    const topClients = Object.values(clientMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Earning Share data for Pie Chart
    const pieData = [
      { name: lang === "ar" ? "حصة العميل (Earnings)" : "Client Share (Earnings)", value: totalClientShare },
      { name: lang === "ar" ? "حصة الشركة (Profits)" : "Company Share (Profits)", value: totalCompanyShare },
    ];

    // Revenue Trend by Month
    const monthTrendMap: Record<string, { month: string; revenue: number; profit: number; clientShare: number }> = {};
    revenues.forEach((r) => {
      const label = monthLabel(r.period_month);
      if (!monthTrendMap[label]) monthTrendMap[label] = { month: label, revenue: 0, profit: 0, clientShare: 0 };
      monthTrendMap[label].revenue += Number(r.total_revenue || 0);
      monthTrendMap[label].profit += Number(r.company_share || 0);
      monthTrendMap[label].clientShare += Number(r.client_share || 0);
    });
    const revenueTrend = Object.values(monthTrendMap);

    return {
      totalGross,
      totalClientShare,
      totalCompanyShare,
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      overdue1_30,
      overdue31_60,
      overdue60Plus,
      agingList: agingList.sort((a, b) => b.overdueDays - a.overdueDays),
      topChannels,
      topClients,
      pieData,
      revenueTrend,
    };
  }, [revenues, invoices]);

  // Export functions
  const handleExportExcel = () => {
    const rows = revenues.map((r) => {
      const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;
      if (!isStaff) {
        return {
          channel: r.channels?.name ?? "",
          link: r.channels?.link ?? "",
          month: monthLabel(r.period_month),
          clientShare: Number(r.client_share),
          paymentStatus: p?.status ? (lang === "ar" ? STATUS_AR[p.status] : (STATUS_EN[p.status] || p.status)) : (lang === "ar" ? "غير محدد" : "Not Specified"),
          amountPaid: Number(p?.amount_paid ?? 0),
          remaining: Number(p?.remaining ?? r.client_share),
        };
      }
      return {
        channel: r.channels?.name ?? "",
        link: r.channels?.link ?? "",
        month: monthLabel(r.period_month),
        revenue: Number(r.total_revenue),
        percentage: Number(r.client_percentage),
        clientShare: Number(r.client_share),
        companyShare: Number(r.company_share),
        paymentStatus: p?.status ? (lang === "ar" ? STATUS_AR[p.status] : (STATUS_EN[p.status] || p.status)) : (lang === "ar" ? "غير محدد" : "Not Specified"),
        amountPaid: Number(p?.amount_paid ?? 0),
        remaining: Number(p?.remaining ?? r.client_share),
      };
    });
    const name = !isStaff ? (user?.email ?? "Client") : (clientId === "all" ? "All Clients" : clients.find((c) => c.id === clientId)?.name ?? "Report");
    exportExcel(`financial-report-${startMonth}_to_${endMonth}.xlsx`, name, rows);
  };

  const handleExportPDF = () => {
    const rows = revenues.map((r) => {
      const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;
      if (!isStaff) {
        return {
          channel: r.channels?.name ?? "",
          link: r.channels?.link ?? "",
          month: monthLabel(r.period_month),
          clientShare: Number(r.client_share),
          paymentStatus: p?.status ? (lang === "ar" ? STATUS_AR[p.status] : (STATUS_EN[p.status] || p.status)) : (lang === "ar" ? "غير محدد" : "Not Specified"),
          amountPaid: Number(p?.amount_paid ?? 0),
          remaining: Number(p?.remaining ?? r.client_share),
        };
      }
      return {
        channel: r.channels?.name ?? "",
        link: r.channels?.link ?? "",
        month: monthLabel(r.period_month),
        revenue: Number(r.total_revenue),
        percentage: Number(r.client_percentage),
        clientShare: Number(r.client_share),
        companyShare: Number(r.company_share),
        paymentStatus: p?.status ? (lang === "ar" ? STATUS_AR[p.status] : (STATUS_EN[p.status] || p.status)) : (lang === "ar" ? "غير محدد" : "Not Specified"),
        amountPaid: Number(p?.amount_paid ?? 0),
        remaining: Number(p?.remaining ?? r.client_share),
      };
    });
    const name = !isStaff ? (user?.email ?? "Client") : (clientId === "all" ? "All Clients" : clients.find((c) => c.id === clientId)?.name ?? "Report");
    exportPDF(`financial-report-${startMonth}_to_${endMonth}.pdf`, name, `${startMonth} to ${endMonth}`, rows);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Top Title Block */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-2">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <BarChart2 className="w-8 h-8 text-primary" />
            {lang === "ar" ? "التقارير المالية والتحليلات" : "Financial Reports & Analytics"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {lang === "ar" 
              ? "متابعة إيرادات القنوات، الأرباح الصافية للشركة، الفواتير المستحقة، وتحليلات أعمار الديون" 
              : "Track channel revenues, net company profits, outstanding invoices, and debt aging analysis"}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="default" className="h-11 px-5 text-sm sm:text-base font-bold bg-slate-900 border-slate-800 text-white hover:bg-slate-800" onClick={handleExportExcel} disabled={isLoading || revenues.length === 0}>
            <FileSpreadsheet className="w-4 h-4 ml-2" /> {lang === "ar" ? "تصدير Excel" : "Export Excel"}
          </Button>
          <Button size="default" className="h-11 px-5 text-sm sm:text-base font-bold" onClick={handleExportPDF} disabled={isLoading || revenues.length === 0}>
            <FileDown className="w-4 h-4 ml-2" /> {lang === "ar" ? "تصدير PDF" : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* Filter Card */}
      <Card className="border border-slate-800 shadow-md">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap gap-5 items-end text-right">
            {isStaff && (
              <div className="space-y-2.5 min-w-[240px] flex-1 sm:flex-initial">
                <Label className="text-sm sm:text-base font-bold text-slate-300">{lang === "ar" ? "العميل" : "Client"}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="h-11 text-sm sm:text-base bg-slate-900 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm sm:text-base">{lang === "ar" ? "جميع العملاء" : "All Clients"}</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm sm:text-base">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2.5 min-w-[160px] flex-1 sm:flex-initial">
              <Label className="text-sm sm:text-base font-bold text-slate-300">{lang === "ar" ? "من شهر" : "From Month"}</Label>
              <Input type="month" className="h-11 text-sm sm:text-base bg-slate-900 border-slate-700 text-white" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2.5 min-w-[160px] flex-1 sm:flex-initial">
              <Label className="text-sm sm:text-base font-bold text-slate-300">{lang === "ar" ? "إلى شهر" : "To Month"}</Label>
              <Input type="month" className="h-11 text-sm sm:text-base bg-slate-900 border-slate-700 text-white" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard KPI cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isStaff ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
        {isStaff && (
          <Card className="border border-slate-800 shadow-sm p-1">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
                <span>{lang === "ar" ? "إجمالي الإيرادات" : "Total Gross Revenue"}</span>
                <DollarSign className="w-5 h-5 text-purple-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-5 px-5">
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-white" dir="ltr">{money(stats.totalGross)}</div>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
                {lang === "ar" ? "الربح الإجمالي لكافة القنوات قبل التقسيم" : "Total gross earnings of all channels before split"}
              </p>
            </CardContent>
          </Card>
        )}

        {isStaff ? (
          <Card className="border border-slate-800 shadow-sm p-1">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
                <span>{lang === "ar" ? "أرباح الشركة الصافية" : "Company Net Profit"}</span>
                <TrendingUp className="w-5 h-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-5 px-5">
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-primary" dir="ltr">{money(stats.totalCompanyShare)}</div>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
                {lang === "ar" ? "إجمالي حصة الشركة من الإيرادات" : "Total net company share from earnings"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-slate-800 shadow-sm p-1">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
                <span>{lang === "ar" ? "إجمالي الأرباح المستحقة" : "Total Earned Revenue"}</span>
                <TrendingUp className="w-5 h-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-5 px-5">
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-primary" dir="ltr">{money(stats.totalClientShare)}</div>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
                {lang === "ar" ? "إجمالي مستحقاتك من إيرادات القنوات" : "Your total payouts outstanding from channels"}
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border border-slate-800 shadow-sm p-1">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
              <span>{lang === "ar" ? "المدفوعات المحصلة" : "Payments Collected"}</span>
              <ArrowUpRight className="w-5 h-5 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 px-5">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-success" dir="ltr">{money(stats.totalPaid)}</div>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
              {lang === "ar" ? "المبالغ التي تم تحصيلها للفواتير" : "Amounts paid and settled for invoices"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5 border shadow-sm p-1">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-destructive flex items-center justify-between">
              <span>{lang === "ar" ? "الديون المعلقة المستحقة" : "Outstanding Balance"}</span>
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 px-5">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-destructive" dir="ltr">{money(stats.totalOutstanding)}</div>
            <p className="text-xs sm:text-sm text-destructive-foreground/90 mt-2 font-medium">
              {lang === "ar" ? "المستحقات المتبقية تحت التحصيل" : "Remaining balance pending collection"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <Card className={isStaff ? "lg:col-span-2 border-slate-800" : "lg:col-span-3 border-slate-800"}>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-white">
              {isStaff 
                ? (lang === "ar" ? "منحنى نمو الأرباح والإيرادات" : "Revenue & Profit Growth Trend") 
                : (lang === "ar" ? "منحنى نمو الأرباح المستحقة" : "Earned Share Growth Trend")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {stats.revenueTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">{lang === "ar" ? "لا توجد بيانات كافية للرسم البياني" : "Not enough data for the chart"}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.revenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#25222b" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip 
                    formatter={(value) => [money(value as any)]} 
                    contentStyle={{ backgroundColor: '#17151a', borderRadius: '12px', border: '1px solid #25222b', color: '#fff' }}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                  />
                  {isStaff ? (
                    <>
                      <Bar dataKey="revenue" name={lang === "ar" ? "إجمالي الإيرادات" : "Gross Revenue"} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" name={lang === "ar" ? "أرباح الشركة" : "Company Profit"} fill="#a21caf" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="clientShare" name={lang === "ar" ? "الأرباح المستحقة" : "Earned Share"} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Earning Share Pie Chart */}
        {isStaff && (
          <Card className="border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-white">{lang === "ar" ? "توزيع الإيرادات والأرباح" : "Revenue & Profit Distribution"}</CardTitle>
            </CardHeader>
            <CardContent className="h-80 flex flex-col justify-between">
              {stats.totalGross === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs">{lang === "ar" ? "لا توجد بيانات" : "No data available"}</div>
              ) : (
                <>
                  <div className="h-60 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {stats.pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => [money(value as any)]} 
                          contentStyle={{ backgroundColor: '#17151a', borderRadius: '12px', border: '1px solid #25222b', color: '#fff' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2.5 text-sm sm:text-base mt-4 border-t border-slate-800 pt-4 text-right">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-violet-500"></span>{lang === "ar" ? "حصة العملاء" : "Clients Share"}</span>
                      <span className="font-extrabold text-white" dir="ltr">{money(stats.totalClientShare)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-fuchsia-600"></span>{lang === "ar" ? "أرباح الشركة" : "Company Profits"}</span>
                      <span className="font-extrabold text-primary" dir="ltr">{money(stats.totalCompanyShare)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs list for detailed tables */}
      <Tabs defaultValue="revenues" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-12 bg-slate-900 border border-slate-800 p-1 rounded-xl mb-6">
          <TabsTrigger value="revenues" className="text-xs sm:text-sm md:text-base font-bold py-2">{lang === "ar" ? "الأرباح الشهرية" : "Monthly Earnings"}</TabsTrigger>
          <TabsTrigger value="aging" className="text-xs sm:text-sm md:text-base font-bold py-2">{lang === "ar" ? `أعمار الديون (${stats.agingList.length})` : `Aging of Debts (${stats.agingList.length})`}</TabsTrigger>
          {isStaff && <TabsTrigger value="channels" className="text-xs sm:text-sm md:text-base font-bold py-2">{lang === "ar" ? "أهم القنوات" : "Top Channels"}</TabsTrigger>}
          {isStaff && <TabsTrigger value="clients" className="text-xs sm:text-sm md:text-base font-bold py-2">{lang === "ar" ? "أهم العملاء" : "Top Clients"}</TabsTrigger>}
        </TabsList>

        <TabsContent value="revenues" className="border border-slate-800 rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "القناة" : "Channel"}</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "الشهر" : "Month"}</TableHead>
                {isStaff && <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "الإيراد" : "Revenue"}</TableHead>}
                {isStaff && <TableHead className="text-center text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "النسبة" : "Percent"}</TableHead>}
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-success">
                  {isStaff ? (lang === "ar" ? "حصة العميل" : "Client Share") : (lang === "ar" ? "الأرباح المستحقة" : "Earned Share")}
                </TableHead>
                {isStaff && <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-primary">{lang === "ar" ? "حصة الشركة" : "Company Share"}</TableHead>}
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "حالة الدفع" : "Payment Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 7 : 4} className="text-center py-8 text-sm sm:text-base text-muted-foreground">{lang === "ar" ? "لا توجد إيرادات في هذه الفترة" : "No revenues in this period"}</TableCell>
                </TableRow>
              )}
              {revenues.map((r, i) => {
                const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;
                return (
                  <TableRow key={r.id || i} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="font-bold text-sm sm:text-base py-4.5 px-4 text-right">{r.channels?.name}</TableCell>
                    <TableCell dir="ltr" className="text-right text-sm sm:text-base py-4.5 px-4">{monthLabel(r.period_month)}</TableCell>
                    {isStaff && <TableCell dir="ltr" className="text-left text-sm sm:text-base font-semibold py-4.5 px-4">{money(r.total_revenue)}</TableCell>}
                    {isStaff && <TableCell dir="ltr" className="text-center text-sm sm:text-base py-4.5 px-4">{r.client_percentage}%</TableCell>}
                    <TableCell dir="ltr" className="text-left text-success font-extrabold text-sm sm:text-base py-4.5 px-4">{money(r.client_share)}</TableCell>
                    {isStaff && <TableCell dir="ltr" className="text-left text-primary font-extrabold text-sm sm:text-base py-4.5 px-4">{money(r.company_share)}</TableCell>}
                    <TableCell className="text-right py-4.5 px-4">
                      {p?.status ? (
                        <Badge variant={p.status === "paid" ? "outline" : "destructive"} className="text-xs sm:text-sm px-2.5 py-1 font-bold">
                          {lang === "ar" ? STATUS_AR[p.status] : (STATUS_EN[p.status] || p.status)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs sm:text-sm px-2.5 py-1 font-bold bg-slate-800 text-slate-300">{lang === "ar" ? "غير مسدد" : "Unpaid"}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="aging" className="border border-slate-800 rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "رقم الفاتورة" : "Invoice No."}</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "العميل" : "Client"}</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "تاريخ الاستحقاق" : "Due Date"}</TableHead>
                <TableHead className="text-center text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "أيام التأخير" : "Days Overdue"}</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "الإجمالي" : "Total"}</TableHead>
                <TableHead className="text-left text-destructive text-sm sm:text-base font-black py-4 px-4">{lang === "ar" ? "الرصيد المعلق" : "Unpaid Balance"}</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "فئة التأخير" : "Aging Category"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.agingList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm sm:text-base text-muted-foreground">
                    {lang === "ar" ? "ممتاز! لا توجد فواتير متأخرة الدفع حالياً" : "Excellent! No overdue invoices currently"}
                  </TableCell>
                </TableRow>
              )}
              {stats.agingList.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-black text-sm sm:text-base py-4.5 px-4 text-white text-right">{inv.invoice_number}</TableCell>
                  <TableCell className="font-semibold text-sm sm:text-base py-4.5 px-4 text-right">{inv.clients?.name}</TableCell>
                  <TableCell dir="ltr" className="text-right text-sm sm:text-base py-4.5 px-4">{inv.due_date}</TableCell>
                  <TableCell dir="ltr" className="text-center text-destructive font-black text-sm sm:text-base py-4.5 px-4">
                    {inv.overdueDays} {lang === "ar" ? "يوم" : "Days"}
                  </TableCell>
                  <TableCell dir="ltr" className="text-left text-sm sm:text-base font-semibold py-4.5 px-4">{money(inv.grand_total)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-destructive font-black text-sm sm:text-base py-4.5 px-4">{money(inv.remaining_balance)}</TableCell>
                  <TableCell className="text-right py-4.5 px-4">
                    {inv.overdueDays <= 30 && <Badge className="bg-orange-100 text-orange-800 text-xs sm:text-sm px-2.5 py-1 font-bold">{lang === "ar" ? "1 - 30 يوم" : "1 - 30 Days"}</Badge>}
                    {inv.overdueDays > 30 && inv.overdueDays <= 60 && <Badge className="bg-amber-100 text-amber-800 text-xs sm:text-sm px-2.5 py-1 font-bold">{lang === "ar" ? "31 - 60 يوم" : "31 - 60 Days"}</Badge>}
                    {inv.overdueDays > 60 && <Badge className="bg-destructive text-destructive-foreground text-xs sm:text-sm px-2.5 py-1 font-bold">{lang === "ar" ? "60+ يوم حرجة" : "60+ Days Critical"}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="channels" className="border border-slate-800 rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "الترتيب" : "Rank"}</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "اسم القناة" : "Channel Name"}</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-primary">{lang === "ar" ? "الإيراد الإجمالي للحقبة" : "Gross Revenue for Period"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topChannels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-sm sm:text-base text-muted-foreground">{lang === "ar" ? "لا توجد قنوات" : "No channels"}</TableCell>
                </TableRow>
              )}
              {stats.topChannels.map((ch, idx) => (
                <TableRow key={ch.name} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-black text-sm sm:text-base py-4.5 px-4 text-right">{idx + 1}</TableCell>
                  <TableCell className="font-bold text-sm sm:text-base py-4.5 px-4 text-white text-right">{ch.name}</TableCell>
                  <TableCell dir="ltr" className="text-left text-primary font-black text-sm sm:text-base py-4.5 px-4">{money(ch.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="clients" className="border border-slate-800 rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "الترتيب" : "Rank"}</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">{lang === "ar" ? "اسم العميل" : "Client Name"}</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-success">{lang === "ar" ? "إجمالي مساهمة أرباح الفترة" : "Total Period Contribution"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topClients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-sm sm:text-base text-muted-foreground">{lang === "ar" ? "لا توجد بيانات" : "No data available"}</TableCell>
                </TableRow>
              )}
              {stats.topClients.map((cl, idx) => (
                <TableRow key={cl.name} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-black text-sm sm:text-base py-4.5 px-4 text-right">{idx + 1}</TableCell>
                  <TableCell className="font-bold text-sm sm:text-base py-4.5 px-4 text-white text-right">{cl.name}</TableCell>
                  <TableCell dir="ltr" className="text-left text-success font-black text-sm sm:text-base py-4.5 px-4">{money(cl.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

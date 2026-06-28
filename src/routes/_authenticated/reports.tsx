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
  const { isStaff, user } = useAuth();
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
    enabled: isStaff,
  });

  // 2. Fetch Data for Period
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["reports-dashboard-data", clientId, startMonth, endMonth, isStaff],
    queryFn: async () => {
      const start = startMonth + "-01";
      const end = endMonth + "-01";

      // Query revenues
      let revQuery = supabase
        .from("monthly_revenues")
        .select(`
          id, period_month, total_revenue, client_percentage, client_share, company_share, views,
          channels(name, client_id, clients(id, name)),
          payments(status, amount_paid, remaining)
        `)
        .gte("period_month", start)
        .lte("period_month", end);

      // Query invoices
      let invQuery = supabase
        .from("invoices")
        .select("id, invoice_number, issue_date, due_date, status, grand_total, amount_paid, remaining_balance, client_id, clients(name)")
        .gte("issue_date", start)
        .lte("issue_date", end + "-31");

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
        // Find self client ID
        const { data: selfClient } = await supabase.from("clients").select("id").eq("user_id", user?.id || "").single();
        if (selfClient) {
          revenues = revenues.filter((r) => r.channels?.client_id === selfClient.id);
          invoices = invoices.filter((i) => i.client_id === selfClient.id);
        } else {
          return { revenues: [], invoices: [] };
        }
      }

      return { revenues, invoices };
    },
  });

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
      { name: "حصة العميل (Earnings)", value: totalClientShare },
      { name: "حصة الشركة (Profits)", value: totalCompanyShare },
    ];

    // Revenue Trend by Month
    const monthTrendMap: Record<string, { month: string; revenue: number; profit: number }> = {};
    revenues.forEach((r) => {
      const label = monthLabel(r.period_month);
      if (!monthTrendMap[label]) monthTrendMap[label] = { month: label, revenue: 0, profit: 0 };
      monthTrendMap[label].revenue += Number(r.total_revenue || 0);
      monthTrendMap[label].profit += Number(r.company_share || 0);
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
      return {
        channel: r.channels?.name ?? "",
        link: r.channels?.link ?? "",
        month: monthLabel(r.period_month),
        revenue: Number(r.total_revenue),
        percentage: Number(r.client_percentage),
        clientShare: Number(r.client_share),
        companyShare: Number(r.company_share),
        paymentStatus: p?.status ? STATUS_AR[p.status] : "غير محدد",
        amountPaid: Number(p?.amount_paid ?? 0),
        remaining: Number(p?.remaining ?? r.client_share),
      };
    });
    const name = clientId === "all" ? "All Clients" : clients.find((c) => c.id === clientId)?.name ?? "Report";
    exportExcel(`financial-report-${startMonth}_to_${endMonth}.xlsx`, name, rows);
  };

  const handleExportPDF = () => {
    const rows = revenues.map((r) => {
      const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;
      return {
        channel: r.channels?.name ?? "",
        link: r.channels?.link ?? "",
        month: monthLabel(r.period_month),
        revenue: Number(r.total_revenue),
        percentage: Number(r.client_percentage),
        clientShare: Number(r.client_share),
        companyShare: Number(r.company_share),
        paymentStatus: p?.status ? STATUS_AR[p.status] : "غير محدد",
        amountPaid: Number(p?.amount_paid ?? 0),
        remaining: Number(p?.remaining ?? r.client_share),
      };
    });
    const name = clientId === "all" ? "All Clients" : clients.find((c) => c.id === clientId)?.name ?? "Report";
    exportPDF(`financial-report-${startMonth}_to_${endMonth}.pdf`, name, `${startMonth} to ${endMonth}`, rows);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Top Title Block */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-2">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <BarChart2 className="w-8 h-8 text-primary" />
            التقارير المالية والتحليلات
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            متابعة إيرادات القنوات، الأرباح الصافية للشركة، الفواتير المستحقة، وتحليلات أعمار الديون
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="default" className="h-11 px-5 text-sm sm:text-base font-bold" onClick={handleExportExcel} disabled={isLoading || revenues.length === 0}>
            <FileSpreadsheet className="w-4 h-4 ml-2" /> تصدير Excel
          </Button>
          <Button size="default" className="h-11 px-5 text-sm sm:text-base font-bold" onClick={handleExportPDF} disabled={isLoading || revenues.length === 0}>
            <FileDown className="w-4 h-4 ml-2" /> تصدير PDF
          </Button>
        </div>
      </div>

      {/* Filter Card */}
      <Card className="border shadow-md">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap gap-5 items-end">
            {isStaff && (
              <div className="space-y-2.5 min-w-[240px] flex-1 sm:flex-initial">
                <Label className="text-sm sm:text-base font-bold text-foreground">العميل</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="h-11 text-sm sm:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm sm:text-base">جميع العملاء</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm sm:text-base">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2.5 min-w-[160px] flex-1 sm:flex-initial">
              <Label className="text-sm sm:text-base font-bold text-foreground">من شهر</Label>
              <Input type="month" className="h-11 text-sm sm:text-base" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2.5 min-w-[160px] flex-1 sm:flex-initial">
              <Label className="text-sm sm:text-base font-bold text-foreground">إلى شهر</Label>
              <Input type="month" className="h-11 text-sm sm:text-base" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border shadow-sm p-1">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
              <span>إجمالي الإيرادات</span>
              <DollarSign className="w-5 h-5 text-purple-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 px-5">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-white" dir="ltr">{money(stats.totalGross)}</div>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 font-medium">الربح الإجمالي لكافة القنوات قبل التقسيم</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm p-1">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
              <span>أرباح الشركة الصافية</span>
              <TrendingUp className="w-5 h-5 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 px-5">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-primary" dir="ltr">{money(stats.totalCompanyShare)}</div>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 font-medium">إجمالي حصة الشركة من الإيرادات</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm p-1">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-slate-300 flex items-center justify-between">
              <span>المدفوعات المحصلة</span>
              <ArrowUpRight className="w-5 h-5 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 px-5">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-success" dir="ltr">{money(stats.totalPaid)}</div>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 font-medium">المبالغ التي تم تحصيلها للفواتير</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5 shadow-sm p-1">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-destructive flex items-center justify-between">
              <span>الديون المعلقة المستحقة</span>
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 px-5">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-destructive" dir="ltr">{money(stats.totalOutstanding)}</div>
            <p className="text-xs sm:text-sm text-destructive-foreground/90 mt-2 font-medium">المستحقات المتبقية تحت التحصيل</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold">منحنى نمو الأرباح والإيرادات</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {stats.revenueTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">لا توجد بيانات كافية للرسم البياني</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.revenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value) => [money(value as any)]} 
                    contentStyle={{ backgroundColor: '#17151a', borderRadius: '12px', border: '1px solid #25222b', color: '#fff' }}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                  />
                  <Bar dataKey="revenue" name="إجمالي الإيرادات" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="أرباح الشركة" fill="#a21caf" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Earning Share Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">توزيع الإيرادات والأرباح</CardTitle>
          </CardHeader>
          <CardContent className="h-80 flex flex-col justify-between">
            {stats.totalGross === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">لا توجد بيانات</div>
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
                <div className="space-y-2.5 text-sm sm:text-base mt-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-violet-500"></span>حصة العملاء</span>
                    <span className="font-extrabold text-white" dir="ltr">{money(stats.totalClientShare)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-fuchsia-600"></span>أرباح الشركة</span>
                    <span className="font-extrabold text-primary" dir="ltr">{money(stats.totalCompanyShare)}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs list for detailed tables */}
      <Tabs defaultValue="revenues" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-12 bg-muted/60 p-1.5 rounded-xl border mb-6">
          <TabsTrigger value="revenues" className="text-xs sm:text-sm md:text-base font-bold py-2">الأرباح الشهرية</TabsTrigger>
          <TabsTrigger value="aging" className="text-xs sm:text-sm md:text-base font-bold py-2">أعمار الديون ({stats.agingList.length})</TabsTrigger>
          {isStaff && <TabsTrigger value="channels" className="text-xs sm:text-sm md:text-base font-bold py-2">أهم القنوات</TabsTrigger>}
          {isStaff && <TabsTrigger value="clients" className="text-xs sm:text-sm md:text-base font-bold py-2">أهم العملاء</TabsTrigger>}
        </TabsList>

        <TabsContent value="revenues" className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">القناة</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">الشهر</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4">الإيراد</TableHead>
                <TableHead className="text-center text-sm sm:text-base font-bold py-4 px-4">النسبة</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-success">حصة العميل</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-primary">حصة الشركة</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">حالة الدفع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm sm:text-base text-muted-foreground">لا توجد إيرادات في هذه الفترة</TableCell>
                </TableRow>
              )}
              {revenues.map((r, i) => {
                const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;
                return (
                  <TableRow key={r.id || i} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="font-bold text-sm sm:text-base py-4.5 px-4">{r.channels?.name}</TableCell>
                    <TableCell dir="ltr" className="text-right text-sm sm:text-base py-4.5 px-4">{monthLabel(r.period_month)}</TableCell>
                    <TableCell dir="ltr" className="text-left text-sm sm:text-base font-semibold py-4.5 px-4">{money(r.total_revenue)}</TableCell>
                    <TableCell dir="ltr" className="text-center text-sm sm:text-base py-4.5 px-4">{r.client_percentage}%</TableCell>
                    <TableCell dir="ltr" className="text-left text-success font-extrabold text-sm sm:text-base py-4.5 px-4">{money(r.client_share)}</TableCell>
                    <TableCell dir="ltr" className="text-left text-primary font-extrabold text-sm sm:text-base py-4.5 px-4">{money(r.company_share)}</TableCell>
                    <TableCell className="text-right py-4.5 px-4">
                      {p?.status ? (
                        <Badge variant={p.status === "paid" ? "outline" : "destructive"} className="text-xs sm:text-sm px-2.5 py-1 font-bold">
                          {STATUS_AR[p.status]}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs sm:text-sm px-2.5 py-1 font-bold">غير مسدد</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="aging" className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">رقم الفاتورة</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">العميل</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">تاريخ الاستحقاق</TableHead>
                <TableHead className="text-center text-sm sm:text-base font-bold py-4 px-4">أيام التأخير</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4">الإجمالي</TableHead>
                <TableHead className="text-left text-destructive text-sm sm:text-base font-black py-4 px-4">الرصيد المعلق</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">فئة التأخير</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.agingList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm sm:text-base text-muted-foreground">ممتاز! لا توجد فواتير متأخرة الدفع حالياً</TableCell>
                </TableRow>
              )}
              {stats.agingList.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-black text-sm sm:text-base py-4.5 px-4 text-white">{inv.invoice_number}</TableCell>
                  <TableCell className="font-semibold text-sm sm:text-base py-4.5 px-4">{inv.clients?.name}</TableCell>
                  <TableCell dir="ltr" className="text-right text-sm sm:text-base py-4.5 px-4">{inv.due_date}</TableCell>
                  <TableCell dir="ltr" className="text-center text-destructive font-black text-sm sm:text-base py-4.5 px-4">
                    {inv.overdueDays} يوم
                  </TableCell>
                  <TableCell dir="ltr" className="text-left text-sm sm:text-base font-semibold py-4.5 px-4">{money(inv.grand_total)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-destructive font-black text-sm sm:text-base py-4.5 px-4">{money(inv.remaining_balance)}</TableCell>
                  <TableCell className="text-right py-4.5 px-4">
                    {inv.overdueDays <= 30 && <Badge className="bg-orange-100 text-orange-800 text-xs sm:text-sm px-2.5 py-1 font-bold">1 - 30 يوم</Badge>}
                    {inv.overdueDays > 30 && inv.overdueDays <= 60 && <Badge className="bg-amber-100 text-amber-800 text-xs sm:text-sm px-2.5 py-1 font-bold">31 - 60 يوم</Badge>}
                    {inv.overdueDays > 60 && <Badge className="bg-destructive text-destructive-foreground text-xs sm:text-sm px-2.5 py-1 font-bold">60+ يوم حرجة</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="channels" className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">الترتيب</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">اسم القناة</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-primary">الإيراد الإجمالي للحقبة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topChannels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-sm sm:text-base text-muted-foreground">لا توجد قنوات</TableCell>
                </TableRow>
              )}
              {stats.topChannels.map((ch, idx) => (
                <TableRow key={ch.name} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-black text-sm sm:text-base py-4.5 px-4">{idx + 1}</TableCell>
                  <TableCell className="font-bold text-sm sm:text-base py-4.5 px-4 text-white">{ch.name}</TableCell>
                  <TableCell dir="ltr" className="text-left text-primary font-black text-sm sm:text-base py-4.5 px-4">{money(ch.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="clients" className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">الترتيب</TableHead>
                <TableHead className="text-right text-sm sm:text-base font-bold py-4 px-4">اسم العميل</TableHead>
                <TableHead className="text-left text-sm sm:text-base font-bold py-4 px-4 text-success">إجمالي مساهمة أرباح الفترة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topClients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-sm sm:text-base text-muted-foreground">لا توجد بيانات</TableCell>
                </TableRow>
              )}
              {stats.topClients.map((cl, idx) => (
                <TableRow key={cl.name} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-black text-sm sm:text-base py-4.5 px-4">{idx + 1}</TableCell>
                  <TableCell className="font-bold text-sm sm:text-base py-4.5 px-4 text-white">{cl.name}</TableCell>
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

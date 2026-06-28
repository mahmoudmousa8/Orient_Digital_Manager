import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Youtube, DollarSign, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import { money, monthLabel } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { isStaff } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clientsRes, channelsRes, revRes, payRes] = await Promise.all([
        supabase.from("clients").select("id, name"),
        supabase.from("channels").select("id, name, client_id"),
        supabase.from("monthly_revenues").select("period_month, total_revenue, client_share, company_share, channel_id, channels(name, client_id)"),
        supabase.from("payments").select("amount_paid, remaining, status"),
      ]);
      const clients = clientsRes.data ?? [];
      const channels = channelsRes.data ?? [];
      const revenues = (revRes.data ?? []) as any[];
      const payments = (payRes.data ?? []) as any[];

      const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
      const channelMap = new Map(channels.map((c: any) => [c.id, c.name]));

      const byClient = new Map<string, number>();
      const byChannel = new Map<string, number>();
      const byMonth = new Map<string, { revenue: number; clientShare: number; companyShare: number }>();
      for (const r of revenues) {
        const cid = r.channels?.client_id;
        if (cid) byClient.set(cid, (byClient.get(cid) ?? 0) + Number(r.total_revenue));
        byChannel.set(r.channel_id, (byChannel.get(r.channel_id) ?? 0) + Number(r.total_revenue));
        const key = String(r.period_month).slice(0, 7);
        const cur = byMonth.get(key) ?? { revenue: 0, clientShare: 0, companyShare: 0 };
        cur.revenue += Number(r.total_revenue);
        cur.clientShare += Number(r.client_share ?? 0);
        cur.companyShare += Number(r.company_share ?? 0);
        byMonth.set(key, cur);
      }

      const topClients = [...byClient.entries()]
        .map(([id, total]) => ({ name: clientMap.get(id) ?? "—", total }))
        .sort((a, b) => b.total - a.total).slice(0, 5);
      const topChannels = [...byChannel.entries()]
        .map(([id, total]) => ({ name: channelMap.get(id) ?? "—", total }))
        .sort((a, b) => b.total - a.total).slice(0, 5);
      const monthly = [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([m, v]) => ({ month: monthLabel(m + "-01"), revenue: v.revenue, clientShare: v.clientShare, companyShare: v.companyShare }));

      return {
        clients: clients.length,
        channels: channels.length,
        totalRevenue: revenues.reduce((s: number, x: any) => s + Number(x.total_revenue), 0),
        clientPayouts: revenues.reduce((s: number, x: any) => s + Number(x.client_share ?? 0), 0),
        companyProfit: revenues.reduce((s: number, x: any) => s + Number(x.company_share ?? 0), 0),
        unpaid: payments.reduce((s: number, x: any) => s + Number(x.remaining), 0),
        unpaidCount: payments.filter((p) => p.status !== "paid").length,
        topClients, topChannels, monthly,
      };
    },
  });

  const cards = [
    { 
      label: "إجمالي الإيرادات", 
      value: money(data?.totalRevenue), 
      icon: DollarSign, 
      cardBg: "bg-card border-border hover:border-fuchsia-500/50 hover:shadow-lg hover:shadow-fuchsia-950/20",
      iconBg: "bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-600/20 border-none",
      valueColor: "text-fuchsia-400",
      subtext: "إجمالي الأرباح لكافة القنوات قبل تقسيم النسب"
    },
    { 
      label: "أرباح الشركة", 
      value: money(data?.companyProfit), 
      icon: TrendingUp, 
      cardBg: "bg-card border-border hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-950/20",
      iconBg: "bg-purple-600 text-white shadow-sm shadow-purple-600/20 border-none",
      valueColor: "text-purple-400",
      subtext: "إجمالي حصة الشركة الصافية من الإيرادات"
    },
    { 
      label: "مستحقات العملاء", 
      value: money(data?.clientPayouts), 
      icon: Wallet, 
      cardBg: "bg-card border-border hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-950/20",
      iconBg: "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 border-none",
      valueColor: "text-indigo-400",
      subtext: "صافي المبالغ المستحقة لجميع الشركاء"
    },
    { 
      label: "أرصدة معلقة غير مدفوعة", 
      value: money(data?.unpaid), 
      icon: AlertTriangle, 
      cardBg: "bg-card border-border hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-950/20",
      iconBg: "bg-amber-500 text-white shadow-sm shadow-amber-500/20 border-none",
      valueColor: "text-amber-400",
      subtext: `عدد الفواتير غير المدفوعة حالياً: ${data?.unpaidCount ?? 0}`
    },
    { 
      label: "إجمالي القنوات", 
      value: data?.channels ?? 0, 
      icon: Youtube, 
      cardBg: "bg-card border-border hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-950/20",
      iconBg: "bg-blue-600 text-white shadow-sm shadow-blue-600/20 border-none",
      valueColor: "text-blue-400",
      subtext: "عدد قنوات اليوتيوب المضافة بالنظام"
    },
    { 
      label: "إجمالي الشركاء والعملاء", 
      value: data?.clients ?? 0, 
      icon: Users, 
      cardBg: "bg-card border-border hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-950/20",
      iconBg: "bg-teal-600 text-white shadow-sm shadow-teal-600/20 border-none",
      valueColor: "text-teal-400",
      subtext: "عدد حسابات العملاء المسجلين حالياً"
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header Section */}
      <div className="flex items-center justify-between border-b pb-4 border-slate-800">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <TrendingUp className="w-8 h-8 text-primary" />
            {isStaff ? "لوحة التحكم الرئيسية" : "نظرة عامة على الأداء"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">ملخص أداء القنوات، الأرباح، وحالة التسويات المالية الحالية</p>
        </div>
      </div>

      {/* Symmetric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card 
              key={c.label} 
              className={cn(
                "border shadow-md transition-all duration-300 ease-out-expo hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up p-1", 
                c.cardBg
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm sm:text-base font-extrabold text-slate-100">{c.label}</span>
                  <div className={cn("p-2.5 rounded-xl shadow-sm", c.iconBg)}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-white" dir="ltr">
                    {c.value}
                  </div>
                  {c.subtext && (
                    <p className="text-xs sm:text-sm text-slate-300 mt-2 flex items-center gap-1 font-medium">
                      {c.subtext}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Monthly Revenues Chart */}
      <Card 
        className="border shadow-md overflow-hidden bg-card animate-fade-in-up"
        style={{ animationDelay: "360ms" }}
      >
        <CardHeader className="p-6 border-b">
          <CardTitle className="text-base sm:text-lg font-extrabold text-white flex items-center justify-between">
            <span>منحنى الإيرادات وحصص الأرباح (12 شهر الأخيرة)</span>
            <span className="text-xs sm:text-sm font-bold text-slate-300">القيم بالدولار الأمريكي (USD)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.monthly ?? []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorClient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.85}/>
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.15}/>
                  </linearGradient>
                  <linearGradient id="colorCompany" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a21caf" stopOpacity={0.85}/>
                    <stop offset="95%" stopColor="#a21caf" stopOpacity={0.15}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#25222b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#c7c5ca" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#c7c5ca" }} axisLine={false} tickLine={false} />
                <Tooltip 
                  formatter={(v: any) => money(v)} 
                  contentStyle={{ backgroundColor: '#17151a', borderRadius: '12px', border: '1px solid #25222b', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }} 
                  cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                />
                <Bar dataKey="clientShare" stackId="a" fill="url(#colorClient)" name="حصة العميل" radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="companyShare" stackId="a" fill="url(#colorCompany)" name="حصة الشركة" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Performing Leaderboards (Only for Staff) */}
      {isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Clients */}
          <Card 
            className="border shadow-md overflow-hidden bg-card animate-fade-in-up"
            style={{ animationDelay: "420ms" }}
          >
            <CardHeader className="bg-muted/30 border-b p-5">
              <CardTitle className="text-base sm:text-lg font-extrabold text-white">أعلى العملاء إيرادات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-5 p-5">
              {(data?.topClients ?? []).length === 0 && <p className="text-sm sm:text-base text-muted-foreground py-6 text-center">لا توجد بيانات متاحة</p>}
              {data?.topClients.map((c, i) => {
                const maxVal = data.topClients[0]?.total || 1;
                const percentage = Math.round((c.total / maxVal) * 100);
                return (
                  <div key={c.name} className="space-y-2 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm w-7 h-7 rounded-full bg-purple-950/60 text-purple-400 flex items-center justify-center font-black">
                          {i + 1}
                        </span>
                        <span className="font-bold text-sm sm:text-base text-white">{c.name}</span>
                      </div>
                      <span className="font-extrabold text-sm sm:text-base text-white" dir="ltr">{money(c.total)}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-600 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Top Channels */}
          <Card 
            className="border shadow-md overflow-hidden bg-card animate-fade-in-up"
            style={{ animationDelay: "480ms" }}
          >
            <CardHeader className="bg-muted/30 border-b p-5">
              <CardTitle className="text-base sm:text-lg font-extrabold text-white">القنوات الأعلى أداءً وإيرادات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-5 p-5">
              {(data?.topChannels ?? []).length === 0 && <p className="text-sm sm:text-base text-muted-foreground py-6 text-center">لا توجد بيانات متاحة</p>}
              {data?.topChannels.map((c, i) => {
                const maxVal = data.topChannels[0]?.total || 1;
                const percentage = Math.round((c.total / maxVal) * 100);
                return (
                  <div key={c.name} className="space-y-2 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm w-7 h-7 rounded-full bg-fuchsia-950/60 text-fuchsia-400 flex items-center justify-center font-black">
                          {i + 1}
                        </span>
                        <span className="font-bold text-sm sm:text-base text-white">{c.name}</span>
                      </div>
                      <span className="font-extrabold text-sm sm:text-base text-white" dir="ltr">{money(c.total)}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, Pencil, Trash2, Upload, Download, Search } from "lucide-react";
import { money, monthLabel } from "@/lib/format";
import { parseRevenueFile, downloadRevenueTemplate } from "@/lib/exports";
import { useLanguage } from "@/hooks/use-language";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/revenue")({
  component: RevenuePage,
});

type Revenue = {
  id: string; channel_id: string; period_month: string;
  total_revenue: number; client_percentage: number;
  client_share: number; company_share: number; notes: string | null;
  channels?: { 
    name: string; 
    client_percentage: number; 
    system_id?: string | null;
    systems?: { id: string; name: string } | null;
    clients?: { name: string } | null 
  } | null;
};

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function RevenuePage() {
  const { isStaff } = useAuth();
  const { t, lang } = useLanguage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Revenue | null>(null);
  const [channelId, setChannelId] = useState("");
  const [clientPctInput, setClientPctInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterSystem, setFilterSystem] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: systems = [] } = useQuery({
    queryKey: ["systems"],
    queryFn: async () => {
      const { data } = await supabase.from("systems").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: channels = [] } = useQuery({
    queryKey: ["channels-min"],
    queryFn: async () => {
      const { data } = await supabase.from("channels").select("id, name, status, client_percentage, system_percentage, company_percentage, is_monetized, clients(name)").order("name");
      return (data ?? []) as any[];
    },
  });

  const { data: revenues = [], isLoading } = useQuery({
    queryKey: ["revenues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_revenues")
        .select("*, channels(name, client_percentage, system_id, clients(name), systems(id, name))")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data as Revenue[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: any) => {
      if (editing) {
        const { error } = await supabase.from("monthly_revenues").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("monthly_revenues").upsert(payload, { onConflict: "channel_id,period_month" });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("تم الحفظ"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_revenues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("تم الحذف"); },
    onError: (e: any) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const rows = await parseRevenueFile(file);
      if (!rows.length) throw new Error("الملف فارغ أو غير صحيح");
      const byName = new Map<string, any>(channels.map((c: any) => [c.name.toLowerCase().trim(), c]));
      const payload: any[] = [];
      const missing: string[] = [];
      for (const r of rows) {
        const ch = byName.get(r.channel.toLowerCase().trim());
        if (!ch) { missing.push(r.channel); continue; }
        const clientPct = r.percentage ?? ch.client_percentage;
        const systemPct = ch.system_percentage ?? 0;
        const companyPct = 100 - clientPct - systemPct;
        payload.push({
          channel_id: ch.id,
          period_month: r.month,
          total_revenue: r.revenue,
          client_percentage: clientPct,
          company_percentage: companyPct,
        });
      }
      if (!payload.length) throw new Error(`لم يتم العثور على قنوات: ${missing.join(", ")}`);
      const { error } = await supabase.from("monthly_revenues").upsert(payload, { onConflict: "channel_id,period_month" });
      if (error) throw error;
      return { ok: payload.length, missing };
    },
    onSuccess: (res) => {
      qc.invalidateQueries();
      toast.success(`تم استيراد ${res.ok} سجل` + (res.missing.length ? ` — تم تجاهل: ${res.missing.join(", ")}` : ""));
      setImportOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ch = channels.find((c: any) => c.id === channelId);
    const clientPct = Number(clientPctInput || ch?.client_percentage || 50);
    const systemPct = ch?.system_percentage ?? 0;
    const companyPct = 100 - clientPct - systemPct;
    save.mutate({
      channel_id: channelId || editing?.channel_id,
      period_month: String(fd.get("period_month")) + "-01",
      total_revenue: Number(fd.get("total_revenue")),
      client_percentage: clientPct,
      company_percentage: companyPct,
      notes: String(fd.get("notes") || "") || null,
    });
  }

  function openNew() { 
    setEditing(null); 
    setChannelId(""); 
    setClientPctInput(""); 
    setOpen(true); 
  }
  function openEdit(r: Revenue) { 
    setEditing(r); 
    setChannelId(r.channel_id); 
    setClientPctInput(String(r.client_percentage)); 
    setOpen(true); 
  }

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    revenues.forEach((r) => {
      const year = r.period_month.split("-")[0];
      if (year) years.add(year);
    });
    return Array.from(years).sort().reverse();
  }, [revenues]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return revenues.filter((r) => {
      const [year, month] = r.period_month.split("-");
      if (filterYear !== "all" && year !== filterYear) return false;
      if (filterMonth !== "all" && month !== filterMonth) return false;
      if (filterSystem !== "all") {
        if (filterSystem === "direct") {
          if (r.channels?.system_id) return false;
        } else {
          if (r.channels?.system_id !== filterSystem) return false;
        }
      }
      if (q) {
        const hay = `${r.channels?.name ?? ""} ${r.channels?.clients?.name ?? ""} ${r.channels?.systems?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [revenues, search, filterYear, filterMonth, filterSystem]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <DollarSign className="w-8 h-8 text-primary" />
            {t("revenue")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">{lang === "ar" ? "إدخال إيرادات القنوات وحساب الحصص تلقائياً" : "Enter channel revenues and auto-calculate shares"}</p>
        </div>
        {isStaff && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="btn-header-action" onClick={() => downloadRevenueTemplate(channels)}><Download className="w-4 h-4 ml-1" /> {lang === "ar" ? "تحميل نموذج" : "Download Template"}</Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild><Button variant="outline" className="btn-header-action"><Upload className="w-4 h-4 ml-1" /> {lang === "ar" ? "استيراد Excel/CSV" : "Import Excel/CSV"}</Button></DialogTrigger>
              <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100" dir={lang === "ar" ? "rtl" : "ltr"}>
                <DialogHeader><DialogTitle className="text-white text-right font-bold">{lang === "ar" ? "استيراد إيرادات" : "Import Revenues"}</DialogTitle></DialogHeader>
                <div className="space-y-4 text-sm text-right">
                  <p className="text-muted-foreground">{lang === "ar" ? "الأعمدة المطلوبة: channel, month, revenue, percentage (النسبة اختيارية). يدعم XLSX و CSV." : "Required columns: channel, month, revenue, percentage (percentage is optional). Supports XLSX and CSV."}</p>
                  <Input type="file" accept=".xlsx,.xls,.csv" className="bg-slate-900 border-slate-700 text-white" onChange={(e) => {
                    const f = e.target.files?.[0]; if (f) importMut.mutate(f);
                  }} />
                  {importMut.isPending && <p className="text-muted-foreground">{lang === "ar" ? "جاري المعالجة…" : "Processing..."}</p>}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button onClick={openNew} className="btn-header-action"><Plus className="w-4 h-4 ml-1" /> {lang === "ar" ? "إيراد جديد" : "New Revenue"}</Button></DialogTrigger>
              <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100" dir={lang === "ar" ? "rtl" : "ltr"}>
                <DialogHeader><DialogTitle className="text-white text-right font-bold">{editing ? (lang === "ar" ? "تعديل إيراد" : "Edit Revenue") : (lang === "ar" ? "إيراد شهري جديد" : "New Monthly Revenue")}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 text-right">
                  <div className="space-y-2">
                    <Label className="text-slate-300">{lang === "ar" ? "القناة *" : "Channel *"}</Label>
                    <Select 
                      value={channelId} 
                      onValueChange={(val) => {
                        setChannelId(val);
                        const ch = channels.find((c: any) => c.id === val);
                        if (ch) {
                          setClientPctInput(String(ch.client_percentage ?? 50));
                        }
                      }}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue placeholder={lang === "ar" ? "اختر القناة" : "Select channel"} /></SelectTrigger>
                      <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.clients?.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label className="text-slate-300">{lang === "ar" ? "الشهر *" : "Month *"}</Label><Input name="period_month" type="month" required defaultValue={editing ? editing.period_month.slice(0, 7) : firstOfMonth().slice(0, 7)} dir="ltr" className="bg-slate-900 border-slate-700 text-white" /></div>
                    <div className="space-y-2"><Label className="text-slate-300">{lang === "ar" ? "إجمالي الإيراد (USD) *" : "Total Revenue (USD) *"}</Label><Input name="total_revenue" type="number" step="0.01" min="0" required defaultValue={editing?.total_revenue} dir="ltr" className="bg-slate-900 border-slate-700 text-white" /></div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">{lang === "ar" ? "نسبة العميل % (يمكن تجاوز قيمة القناة)" : "Client % (can override channel value)"}</Label>
                    <Input 
                      name="client_percentage" 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="100" 
                      value={clientPctInput} 
                      onChange={(e) => setClientPctInput(e.target.value)} 
                      dir="ltr" 
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                  </div>
                  <DialogFooter className="gap-2 pt-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? t("loading") : t("save")}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={lang === "ar" ? "بحث بالقناة أو العميل…" : "Search by channel or client..."} value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
        </div>
        
        <Select value={filterSystem} onValueChange={setFilterSystem}>
          <SelectTrigger className="w-48 bg-slate-900 border-slate-700">
            <SelectValue placeholder={lang === "ar" ? "كل الأنظمة" : "All Systems"} />
          </SelectTrigger>
          <SelectContent className="bg-slate-950 border-slate-800 text-slate-100">
            <SelectItem value="all">{lang === "ar" ? "كل الأنظمة" : "All Systems"}</SelectItem>
            <SelectItem value="direct">{lang === "ar" ? "مباشر (بدون سيستم)" : "Direct (No System)"}</SelectItem>
            {systems.map((sys: any) => (
              <SelectItem key={sys.id} value={sys.id}>{sys.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-32 bg-slate-900 border-slate-700">
            <SelectValue placeholder={t("yearLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل السنوات" : "All years"}</SelectItem>
            {availableYears.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-40 bg-slate-900 border-slate-700">
            <SelectValue placeholder={lang === "ar" ? "الشهر" : "Month"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الشهور" : "All months"}</SelectItem>
            <SelectItem value="01">{lang === "ar" ? "يناير" : "January"} (01)</SelectItem>
            <SelectItem value="02">{lang === "ar" ? "فبراير" : "February"} (02)</SelectItem>
            <SelectItem value="03">{lang === "ar" ? "مارس" : "March"} (03)</SelectItem>
            <SelectItem value="04">{lang === "ar" ? "أبريل" : "April"} (04)</SelectItem>
            <SelectItem value="05">{lang === "ar" ? "مايو" : "May"} (05)</SelectItem>
            <SelectItem value="06">{lang === "ar" ? "يونيو" : "June"} (06)</SelectItem>
            <SelectItem value="07">{lang === "ar" ? "يوليو" : "July"} (07)</SelectItem>
            <SelectItem value="08">{lang === "ar" ? "أغسطس" : "August"} (08)</SelectItem>
            <SelectItem value="09">{lang === "ar" ? "سبتمبر" : "September"} (09)</SelectItem>
            <SelectItem value="10">{lang === "ar" ? "أكتوبر" : "October"} (10)</SelectItem>
            <SelectItem value="11">{lang === "ar" ? "نوفمبر" : "November"} (11)</SelectItem>
            <SelectItem value="12">{lang === "ar" ? "ديسمبر" : "December"} (12)</SelectItem>
          </SelectContent>
        </Select>

        {(filterYear !== "all" || filterMonth !== "all" || filterSystem !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterYear("all"); setFilterMonth("all"); setFilterSystem("all"); }} className="text-slate-300 hover:text-white">
            {t("clearFilters")}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{lang === "ar" ? "الشهر" : "Month"}</TableHead>
                <TableHead className="text-right">{t("channelName")}</TableHead>
                <TableHead className="text-right">{t("clientName")}</TableHead>
                {isStaff && <TableHead className="text-right">{lang === "ar" ? "إجمالي الإيراد" : "Total Revenue"}</TableHead>}
                {isStaff && <TableHead className="text-right">{t("clientPercent")}</TableHead>}
                {isStaff && <TableHead className="text-right">{t("systemPercent")}</TableHead>}
                {isStaff && <TableHead className="text-right">{t("companyPercent")}</TableHead>}
                <TableHead className="text-right">{t("clientShare")}</TableHead>
                {isStaff && <TableHead className="text-right">{lang === "ar" ? "حصة السيستم" : "System Share"}</TableHead>}
                {isStaff && <TableHead className="text-right">{lang === "ar" ? "حصة الشركة" : "Company Share"}</TableHead>}
                {isStaff && <TableHead className="text-left">{t("actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={isStaff ? 11 : 4} className="text-center">{t("loading")}</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={isStaff ? 11 : 4} className="text-center text-muted-foreground py-8">{lang === "ar" ? "لا توجد إيرادات" : "No revenues found"}</TableCell></TableRow>}
              {filtered.map((r) => {
                const systemPct = 100 - r.client_percentage - r.company_percentage;
                const systemShare = r.total_revenue * systemPct / 100;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-right">{monthLabel(r.period_month)}</TableCell>
                    <TableCell className="font-medium text-right">{r.channels?.name}</TableCell>
                    <TableCell className="text-right">{r.channels?.clients?.name}</TableCell>
                    {isStaff && <TableCell dir="ltr" className="text-white text-right">{money(r.total_revenue)}</TableCell>}
                    {isStaff && <TableCell dir="ltr" className="text-white text-right">{r.client_percentage}%</TableCell>}
                    {isStaff && <TableCell dir="ltr" className="text-white text-right">{systemPct}%</TableCell>}
                    {isStaff && <TableCell dir="ltr" className="text-white text-right">{r.company_percentage}%</TableCell>}
                    <TableCell dir="ltr" className="text-white font-medium text-right">{money(r.client_share)}</TableCell>
                    {isStaff && <TableCell dir="ltr" className="text-white font-medium text-right">{money(systemShare)}</TableCell>}
                    {isStaff && <TableCell dir="ltr" className="text-white font-medium text-right">{money(r.company_share)}</TableCell>}
                    {isStaff && <TableCell className="text-left">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(r.id)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" /></Button>
                      </div>
                    </TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="bg-slate-900 border border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-right">{lang === "ar" ? "هل أنت متأكد تماماً من حذف هذا الإيراد؟" : "Are you absolutely sure you want to delete this revenue?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              {lang === "ar" ? "هذا الإجراء سيقوم بحذف سجل الأرباح الشهرية من النظام، وسيؤثر على الحسابات والفواتير المرتبطة." : "This action will permanently delete the monthly revenue record from the system, which will affect associated settlements and invoices."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  del.mutate(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {lang === "ar" ? "نعم، احذف سجل الأرباح" : "Yes, delete revenue record"}
            </AlertDialogAction>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">{t("cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
  channels?: { name: string; client_percentage: number; clients?: { name: string } | null } | null;
};

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function RevenuePage() {
  const { isStaff } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Revenue | null>(null);
  const [channelId, setChannelId] = useState("");
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels-min"],
    queryFn: async () => {
      const { data } = await supabase.from("channels").select("id, name, client_percentage, system_percentage, company_percentage, is_monetized, clients(name)").order("name");
      return (data ?? []) as any[];
    },
  });

  const { data: revenues = [], isLoading } = useQuery({
    queryKey: ["revenues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_revenues")
        .select("*, channels(name, client_percentage, clients(name), systems(name))")
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
    const clientPct = Number(fd.get("client_percentage") || ch?.client_percentage || 50);
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

  function openNew() { setEditing(null); setChannelId(""); setOpen(true); }
  function openEdit(r: Revenue) { setEditing(r); setChannelId(r.channel_id); setOpen(true); }

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
      if (q) {
        const hay = `${r.channels?.name ?? ""} ${r.channels?.clients?.name ?? ""} ${r.channels?.systems?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [revenues, search, filterYear, filterMonth]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <DollarSign className="w-8 h-8 text-primary" />
            الإيرادات الشهرية
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">إدخال إيرادات القنوات وحساب الحصص تلقائياً</p>
        </div>
        {isStaff && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="btn-header-action" onClick={() => downloadRevenueTemplate(channels)}><Download className="w-4 h-4 ml-1" /> تحميل نموذج</Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild><Button variant="outline" className="btn-header-action"><Upload className="w-4 h-4 ml-1" /> استيراد Excel/CSV</Button></DialogTrigger>
              <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>استيراد إيرادات</DialogTitle></DialogHeader>
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">الأعمدة المطلوبة: <code dir="ltr">channel, month, revenue, percentage</code> (النسبة اختيارية). يدعم XLSX و CSV.</p>
                  <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => {
                    const f = e.target.files?.[0]; if (f) importMut.mutate(f);
                  }} />
                  {importMut.isPending && <p className="text-muted-foreground">جاري المعالجة…</p>}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button onClick={openNew} className="btn-header-action"><Plus className="w-4 h-4 ml-1" /> إيراد جديد</Button></DialogTrigger>
              <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>{editing ? "تعديل إيراد" : "إيراد شهري جديد"}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>القناة *</Label>
                    <Select value={channelId} onValueChange={setChannelId}>
                      <SelectTrigger><SelectValue placeholder="اختر القناة" /></SelectTrigger>
                      <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.clients?.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>الشهر *</Label><Input name="period_month" type="month" required defaultValue={editing ? editing.period_month.slice(0, 7) : firstOfMonth().slice(0, 7)} dir="ltr" /></div>
                    <div className="space-y-2"><Label>إجمالي الإيراد (USD) *</Label><Input name="total_revenue" type="number" step="0.01" min="0" required defaultValue={editing?.total_revenue} dir="ltr" /></div>
                  </div>
                  <div className="space-y-2"><Label>نسبة العميل % (يمكن تجاوز قيمة القناة)</Label><Input name="client_percentage" type="number" step="0.01" min="0" max="100" defaultValue={editing?.client_percentage ?? channels.find((c: any) => c.id === channelId)?.client_percentage ?? 50} dir="ltr" /></div>
                  <DialogFooter><Button type="submit" disabled={save.isPending}>حفظ</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالقناة أو العميل…" value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
        </div>
        
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="السنة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السنوات</SelectItem>
            {availableYears.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الشهر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الشهور</SelectItem>
            <SelectItem value="01">يناير (01)</SelectItem>
            <SelectItem value="02">فبراير (02)</SelectItem>
            <SelectItem value="03">مارس (03)</SelectItem>
            <SelectItem value="04">أبريل (04)</SelectItem>
            <SelectItem value="05">مايو (05)</SelectItem>
            <SelectItem value="06">يونيو (06)</SelectItem>
            <SelectItem value="07">يوليو (07)</SelectItem>
            <SelectItem value="08">أغسطس (08)</SelectItem>
            <SelectItem value="09">سبتمبر (09)</SelectItem>
            <SelectItem value="10">أكتوبر (10)</SelectItem>
            <SelectItem value="11">نوفمبر (11)</SelectItem>
            <SelectItem value="12">ديسمبر (12)</SelectItem>
          </SelectContent>
        </Select>

        {(filterYear !== "all" || filterMonth !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterYear("all"); setFilterMonth("all"); }}>
            مسح التصفية
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الشهر</TableHead>
                <TableHead className="text-right">القناة</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                {isStaff && <TableHead className="text-right">إجمالي الإيراد</TableHead>}
                {isStaff && <TableHead className="text-right">النسبة</TableHead>}
                <TableHead className="text-right">حصة العميل</TableHead>
                {isStaff && <TableHead className="text-right">حصة الشركة</TableHead>}
                {isStaff && <TableHead className="text-left">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={isStaff ? 8 : 4} className="text-center">جاري التحميل…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={isStaff ? 8 : 4} className="text-center text-muted-foreground py-8">لا توجد إيرادات</TableCell></TableRow>}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-right">{monthLabel(r.period_month)}</TableCell>
                  <TableCell className="font-medium text-right">{r.channels?.name}</TableCell>
                  <TableCell className="text-right">{r.channels?.clients?.name}</TableCell>
                  {isStaff && <TableCell dir="ltr" className="text-white text-right">{money(r.total_revenue)}</TableCell>}
                  {isStaff && <TableCell dir="ltr" className="text-white text-right">{r.client_percentage}%</TableCell>}
                  <TableCell dir="ltr" className="text-white font-medium text-right">{money(r.client_share)}</TableCell>
                  {isStaff && <TableCell dir="ltr" className="text-white font-medium text-right">{money(r.company_share)}</TableCell>}
                  {isStaff && <TableCell className="text-left">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(r.id)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" /></Button>
                    </div>
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد تماماً من حذف هذا الإيراد؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء سيقوم بحذف سجل الأرباح الشهرية من النظام، وسيؤثر على الحسابات والفواتير المرتبطة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  del.mutate(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              نعم، احذف سجل الأرباح
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

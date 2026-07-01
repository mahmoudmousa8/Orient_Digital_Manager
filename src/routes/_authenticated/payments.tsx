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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, History, Plus, Search, Trash2 } from "lucide-react";
import { money, monthLabel, STATUS_AR } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

type Pay = {
  id: string; revenue_id: string; status: "paid" | "unpaid" | "partial";
  amount_paid: number; remaining: number; vodafone_transfer_no: string | null;
  payment_date: string | null; notes: string | null;
  monthly_revenues?: { period_month: string; client_share: number; channels?: { name: string; clients?: { name: string; vodafone_cash: string | null } | null } | null } | null;
};

type Tx = {
  id: string; payment_id: string; amount: number; transaction_date: string;
  vodafone_transfer_no: string | null; notes: string | null;
};

const statusVariant: Record<string, string> = {
  paid: "bg-[#fbbf24] text-black font-bold rounded-full border-none",
  unpaid: "bg-[#d946ef] text-white rounded-full border-none",
  partial: "bg-amber-500 text-white rounded-full border-none",
};

function PaymentsPage() {
  const { isStaff } = useAuth();
  const qc = useQueryClient();
  const [historyFor, setHistoryFor] = useState<Pay | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, monthly_revenues(period_month, client_share, channels(name, clients(name, vodafone_cash)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pay[];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["payment-transactions", historyFor?.id],
    enabled: !!historyFor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("payment_id", historyFor!.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as Tx[];
    },
  });

  const addTx = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("payment_transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment-transactions"] });
      toast.success("تم تسجيل الدفعة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment-transactions"] });
      toast.success("تم الحذف");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleAddTx(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!historyFor) return;
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    if (amount <= 0) { toast.error("المبلغ يجب أن يكون أكبر من صفر"); return; }
    addTx.mutate({
      payment_id: historyFor.id,
      amount,
      transaction_date: String(fd.get("transaction_date") || new Date().toISOString().slice(0, 10)),
      vodafone_transfer_no: String(fd.get("vodafone_transfer_no") || "") || null,
      notes: String(fd.get("notes") || "") || null,
    });
    (e.currentTarget as HTMLFormElement).reset();
  }

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    payments.forEach((p) => {
      const year = p.monthly_revenues?.period_month.split("-")[0];
      if (year) years.add(year);
    });
    return Array.from(years).sort().reverse();
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      const period = p.monthly_revenues?.period_month;
      if (period) {
        const [year, month] = period.split("-");
        if (filterYear !== "all" && year !== filterYear) return false;
        if (filterMonth !== "all" && month !== filterMonth) return false;
      } else if (filterYear !== "all" || filterMonth !== "all") {
        return false;
      }
      if (q) {
        const hay = `${p.monthly_revenues?.channels?.name ?? ""} ${p.monthly_revenues?.channels?.clients?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [payments, search, filterStatus, filterYear, filterMonth]);

  const totals = useMemo(() => ({
    due: filtered.reduce((s, p) => s + Number(p.monthly_revenues?.client_share ?? 0), 0),
    paid: filtered.reduce((s, p) => s + Number(p.amount_paid), 0),
    remaining: filtered.reduce((s, p) => s + Number(p.remaining), 0),
  }), [filtered]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
          <CreditCard className="w-8 h-8 text-primary" />
          المدفوعات
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">سجل التحويلات والمدفوعات الجزئية وحساب الأرصدة تلقائياً</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-slate-300 font-medium">إجمالي المستحق</div><div className="text-xl font-bold text-white" dir="ltr">{money(totals.due)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-300 font-medium">إجمالي المدفوع</div><div className="text-xl font-bold text-white" dir="ltr">{money(totals.paid)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-300 font-medium">إجمالي المتبقي</div><div className="text-xl font-bold text-white" dir="ltr">{money(totals.remaining)}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالقناة أو العميل…" value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-300">حالة الدفع</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="حالة الدفع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {["paid","partial","unpaid"].map(s => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-300">السنة</Label>
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
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-300">الشهر</Label>
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
        </div>

        {(filterYear !== "all" || filterMonth !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterYear("all"); setFilterMonth("all"); }} className="mb-1">
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
                <TableHead className="text-right">المستحق</TableHead>
                <TableHead className="text-right">المدفوع</TableHead>
                <TableHead className="text-right">المتبقي</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">آخر تحويل</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center">…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">لا توجد مدفوعات</TableCell></TableRow>}
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-right">{p.monthly_revenues ? monthLabel(p.monthly_revenues.period_month) : "—"}</TableCell>
                  <TableCell className="font-medium text-right">{p.monthly_revenues?.channels?.name}</TableCell>
                  <TableCell className="text-right">{p.monthly_revenues?.channels?.clients?.name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{money(p.monthly_revenues?.client_share)}</TableCell>
                  <TableCell dir="ltr" className="text-white text-right">{money(p.amount_paid)}</TableCell>
                  <TableCell dir="ltr" className="text-white text-right">{money(p.remaining)}</TableCell>
                  <TableCell className="text-right"><Badge className={statusVariant[p.status]}>{STATUS_AR[p.status]}</Badge></TableCell>
                  <TableCell dir="ltr" className="text-xs text-right">{p.vodafone_transfer_no || "—"}{p.payment_date ? ` · ${p.payment_date}` : ""}</TableCell>
                  <TableCell className="text-left">
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setHistoryFor(p)}>
                        <History className="w-4 h-4 ml-1" /> السجل
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!historyFor} onOpenChange={(v) => !v && setHistoryFor(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>سجل المدفوعات</DialogTitle></DialogHeader>
          {historyFor && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                <div>القناة: <strong>{historyFor.monthly_revenues?.channels?.name}</strong> · العميل: <strong>{historyFor.monthly_revenues?.channels?.clients?.name}</strong></div>
                <div>الشهر: <strong>{historyFor.monthly_revenues ? monthLabel(historyFor.monthly_revenues.period_month) : ""}</strong></div>
                <div className="flex gap-4 flex-wrap pt-1">
                  <span>المستحق: <strong dir="ltr">{money(historyFor.monthly_revenues?.client_share)}</strong></span>
                  <span>المدفوع: <strong dir="ltr" className="text-success">{money(historyFor.amount_paid)}</strong></span>
                  <span>المتبقي: <strong dir="ltr" className="text-destructive">{money(historyFor.remaining)}</strong></span>
                </div>
                {historyFor.monthly_revenues?.channels?.clients?.vodafone_cash && (
                  <div>إنستاباي / محفظة العميل: <strong dir="ltr">{historyFor.monthly_revenues.channels.clients.vodafone_cash}</strong></div>
                )}
              </div>

              {isStaff && historyFor.remaining > 0 && (
                <form onSubmit={handleAddTx} className="border rounded-md p-3 space-y-3">
                  <div className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> تسجيل دفعة جديدة</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>المبلغ (USD)</Label><Input name="amount" type="number" step="0.01" min="0.01" max={historyFor.remaining} required dir="ltr" defaultValue={historyFor.remaining} /></div>
                    <div className="space-y-1"><Label>التاريخ</Label><Input name="transaction_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} dir="ltr" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>رقم المعاملة / التحويل</Label><Input name="vodafone_transfer_no" placeholder="رقم المعاملة أو كود التحويل..." dir="ltr" /></div>
                    <div className="space-y-1"><Label>ملاحظات</Label><Input name="notes" /></div>
                  </div>
                  <Button type="submit" size="sm" disabled={addTx.isPending}>حفظ الدفعة</Button>
                </form>
              )}

              <div>
                <div className="font-semibold mb-2">المعاملات السابقة</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">رقم التحويل</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                    {isStaff && <TableHead></TableHead>}
                  </TableRow></TableHeader>
                  <TableBody>
                    {transactions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">لا توجد معاملات</TableCell></TableRow>}
                    {transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell dir="ltr">{t.transaction_date}</TableCell>
                        <TableCell dir="ltr" className="text-white font-medium">{money(t.amount)}</TableCell>
                        <TableCell dir="ltr">{t.vodafone_transfer_no || "—"}</TableCell>
                        <TableCell className="text-xs">{t.notes || "—"}</TableCell>
                        {isStaff && <TableCell><Button size="icon" variant="ghost" onClick={() => setDeleteTarget(t.id)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" /></Button></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setHistoryFor(null)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد تماماً من حذف هذه المعاملة؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء سيقوم بحذف سجل الدفعة المالية وإلغاء الإيصال التلقائي وتحديث أرصدة الفواتير المتبقية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  delTx.mutate(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              نعم، احذف الدفعة
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

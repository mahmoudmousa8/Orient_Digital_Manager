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
import { ChevronDown, CreditCard, History, Plus, Search, Trash2 } from "lucide-react";
import { money, monthLabel, STATUS_AR } from "@/lib/format";
import { useLanguage } from "@/hooks/use-language";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { t, lang } = useLanguage();
  const qc = useQueryClient();
  const [historyFor, setHistoryFor] = useState<Pay | null>(null);
  const [payTarget, setPayTarget] = useState<Pay | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["paid", "unpaid", "partial"]);
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
      if (!selectedStatuses.includes(p.status)) {
        return false;
      }
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
  }, [payments, search, selectedStatuses, filterYear, filterMonth]);

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
          {t("paymentsTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">{t("paymentsDesc")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-slate-300 font-medium">{t("dueAmount")}</div><div className="text-xl font-bold text-white" dir="ltr">{money(totals.due)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-300 font-medium">{t("paidAmount")}</div><div className="text-xl font-bold text-white" dir="ltr">{money(totals.paid)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-300 font-medium">{t("remainingAmount")}</div><div className="text-xl font-bold text-white" dir="ltr">{money(totals.remaining)}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("searchPaymentsPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-300">{t("allPaymentsStatus")}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-48 bg-slate-900 border-slate-700 justify-between text-right text-xs rounded-xl h-9 hover:bg-slate-900 hover:text-white">
                <span className="truncate">
                  {selectedStatuses.length === 3
                    ? (lang === "ar" ? "كل الحالات" : "All statuses")
                    : selectedStatuses.length === 0
                    ? (lang === "ar" ? "لم يتم تحديد أي حالة" : "No status selected")
                    : selectedStatuses.map((s) => lang === "ar" ? STATUS_AR[s] : s.charAt(0).toUpperCase() + s.slice(1)).join("، ")}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-slate-900 border-slate-700 text-slate-100">
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.includes("paid")}
                onCheckedChange={(checked) => {
                  if (checked) {
                     setSelectedStatuses([...selectedStatuses, "paid"]);
                  } else {
                     setSelectedStatuses(selectedStatuses.filter((s) => s !== "paid"));
                  }
                }}
                className="text-right justify-start cursor-pointer hover:bg-primary/20"
              >
                {lang === "ar" ? "مدفوع" : "Paid"}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.includes("unpaid")}
                onCheckedChange={(checked) => {
                  if (checked) {
                     setSelectedStatuses([...selectedStatuses, "unpaid"]);
                  } else {
                     setSelectedStatuses(selectedStatuses.filter((s) => s !== "unpaid"));
                  }
                }}
                className="text-right justify-start cursor-pointer hover:bg-primary/20"
              >
                {lang === "ar" ? "غير مدفوع" : "Unpaid"}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStatuses.includes("partial")}
                onCheckedChange={(checked) => {
                  if (checked) {
                     setSelectedStatuses([...selectedStatuses, "partial"]);
                  } else {
                     setSelectedStatuses(selectedStatuses.filter((s) => s !== "partial"));
                  }
                }}
                className="text-right justify-start cursor-pointer hover:bg-primary/20"
              >
                {lang === "ar" ? "مدفوع جزئياً" : "Partially Paid"}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-300">{t("yearLabel")}</Label>
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
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-300">{lang === "ar" ? "الشهر" : "Month"}</Label>
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
        </div>

        {(filterYear !== "all" || filterMonth !== "all" || selectedStatuses.length !== 3) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterYear("all"); setFilterMonth("all"); setSelectedStatuses(["paid", "unpaid", "partial"]); }} className="mb-1 text-slate-300 hover:text-white">
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
                <TableHead className="text-right">{t("dueAmount")}</TableHead>
                <TableHead className="text-right">{t("paidAmount")}</TableHead>
                <TableHead className="text-right">{t("remainingAmount")}</TableHead>
                <TableHead className="text-right">{t("status")}</TableHead>
                <TableHead className="text-right">{t("lastTransfer")}</TableHead>
                <TableHead className="text-left">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center">{t("loading")}</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{lang === "ar" ? "لا توجد مدفوعات" : "No payments found"}</TableCell></TableRow>}
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-right">{p.monthly_revenues ? monthLabel(p.monthly_revenues.period_month) : "—"}</TableCell>
                  <TableCell className="font-medium text-right">{p.monthly_revenues?.channels?.name}</TableCell>
                  <TableCell className="text-right">{p.monthly_revenues?.channels?.clients?.name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{money(p.monthly_revenues?.client_share)}</TableCell>
                  <TableCell dir="ltr" className="text-white text-right">{money(p.amount_paid)}</TableCell>
                  <TableCell dir="ltr" className="text-white text-right">{money(p.remaining)}</TableCell>
                  <TableCell className="text-right"><Badge className={statusVariant[p.status]}>{lang === "ar" ? STATUS_AR[p.status] : p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Badge></TableCell>
                  <TableCell dir="ltr" className="text-xs text-right">{p.vodafone_transfer_no || "—"}{p.payment_date ? ` · ${p.payment_date}` : ""}</TableCell>
                  <TableCell className="text-left">
                    <div className="flex gap-2 justify-end">
                      {isStaff && p.remaining > 0 && (
                        <Button size="sm" className="bg-primary hover:bg-primary/90 text-white font-bold h-8 rounded-xl px-3" onClick={() => setPayTarget(p)}>
                          <CreditCard className={cn("w-4 h-4", lang === "ar" ? "ml-1" : "mr-1")} /> {t("registerPay")}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 border-slate-700 hover:bg-slate-900 text-white" onClick={() => setHistoryFor(p)}>
                        <History className={cn("w-4 h-4", lang === "ar" ? "ml-1" : "mr-1")} /> {t("history")}
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
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-2xl bg-slate-950 border border-slate-800 text-slate-100">
          <DialogHeader><DialogTitle className="text-white text-right font-bold">{t("paymentHistory")}</DialogTitle></DialogHeader>
          {historyFor && (
            <div className="space-y-4 text-right">
              <div className="bg-slate-900 border border-slate-850 p-3 rounded-md text-sm space-y-1">
                <div>{t("channelName")}: <strong>{historyFor.monthly_revenues?.channels?.name}</strong> · {t("clientName")}: <strong>{historyFor.monthly_revenues?.channels?.clients?.name}</strong></div>
                <div>{lang === "ar" ? "الشهر" : "Month"}: <strong>{historyFor.monthly_revenues ? monthLabel(historyFor.monthly_revenues.period_month) : ""}</strong></div>
                <div className="flex gap-4 flex-wrap pt-1 text-slate-300">
                  <span>{t("dueAmount")}: <strong dir="ltr">{money(historyFor.monthly_revenues?.client_share)}</strong></span>
                  <span>{t("paidAmount")}: <strong dir="ltr" className="text-green-400">{money(historyFor.amount_paid)}</strong></span>
                  <span>{t("remainingAmount")}: <strong dir="ltr" className="text-red-400">{money(historyFor.remaining)}</strong></span>
                </div>
                {historyFor.monthly_revenues?.channels?.clients?.vodafone_cash && (
                  <div>{lang === "ar" ? "إنستاباي / محفظة العميل" : "Client InstaPay / Wallet"}: <strong dir="ltr">{historyFor.monthly_revenues.channels.clients.vodafone_cash}</strong></div>
                )}
              </div>

              {isStaff && historyFor.remaining > 0 && (
                <form onSubmit={handleAddTx} className="border border-slate-800 rounded-md p-3 space-y-3">
                  <div className="font-semibold flex items-center gap-2 text-white"><Plus className="w-4 h-4" /> {lang === "ar" ? "تسجيل دفعة جديدة" : "Register new payment"}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-slate-300">{lang === "ar" ? "المبلغ (USD) *" : "Amount (USD) *"}</Label><Input name="amount" type="number" step="0.01" min="0.01" max={historyFor.remaining} required dir="ltr" defaultValue={historyFor.remaining} className="bg-slate-900 border-slate-700 text-white" /></div>
                    <div className="space-y-1"><Label className="text-slate-300">{lang === "ar" ? "التاريخ" : "Date"}</Label><Input name="transaction_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} dir="ltr" className="bg-slate-900 border-slate-700 text-white" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-slate-300">{t("transferNo")}</Label><Input name="vodafone_transfer_no" placeholder={lang === "ar" ? "رقم المعاملة أو كود التحويل..." : "Transaction number or transfer code..."} dir="ltr" className="bg-slate-900 border-slate-700 text-white" /></div>
                    <div className="space-y-1"><Label className="text-slate-300">{t("notes")}</Label><Input name="notes" className="bg-slate-900 border-slate-700 text-white" /></div>
                  </div>
                  <Button type="submit" size="sm" disabled={addTx.isPending}>{addTx.isPending ? t("loading") : (lang === "ar" ? "حفظ الدفعة" : "Save payment")}</Button>
                </form>
              )}

              <div>
                <div className="font-semibold mb-2 text-white">{t("prevTransactions")}</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t("transactionDate")}</TableHead>
                    <TableHead className="text-right">{lang === "ar" ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead className="text-right">{t("transferNo")}</TableHead>
                    <TableHead className="text-right">{t("notes")}</TableHead>
                    {isStaff && <TableHead></TableHead>}
                  </TableRow></TableHeader>
                  <TableBody>
                    {transactions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">{t("noData")}</TableCell></TableRow>}
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
          <DialogFooter><Button variant="outline" className="border-slate-700 hover:bg-slate-900 text-white" onClick={() => setHistoryFor(null)}>{t("close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!payTarget} onOpenChange={(v) => !v && setPayTarget(null)}>
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="max-w-md bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">{t("quickPayTitle")}</DialogTitle>
          </DialogHeader>
          {payTarget && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const amount = Number(fd.get("amount"));
              if (amount <= 0) { toast.error(lang === "ar" ? "المبلغ يجب أن يكون أكبر من صفر" : "Amount must be greater than zero"); return; }
              addTx.mutate({
                payment_id: payTarget.id,
                amount,
                transaction_date: String(fd.get("transaction_date") || new Date().toISOString().slice(0, 10)),
                vodafone_transfer_no: String(fd.get("vodafone_transfer_no") || "") || null,
                notes: String(fd.get("notes") || "") || null,
              }, {
                onSuccess: () => {
                  setPayTarget(null);
                }
              });
            }} className="space-y-4 pt-2">
              <div className="bg-slate-900 border border-slate-850 p-3 rounded-lg text-sm space-y-1 text-right">
                <div>{t("channelName")}: <strong>{payTarget.monthly_revenues?.channels?.name}</strong></div>
                <div>{t("clientName")}: <strong>{payTarget.monthly_revenues?.channels?.clients?.name}</strong></div>
                {payTarget.monthly_revenues?.channels?.clients?.vodafone_cash && (
                  <div className="text-primary font-semibold">{lang === "ar" ? "محفظة/إنستاباي العميل" : "Client InstaPay/Wallet"}: <span dir="ltr">{payTarget.monthly_revenues.channels.clients.vodafone_cash}</span></div>
                )}
                <div className="flex gap-4 pt-1 text-slate-300">
                  <span>{t("dueAmount")}: <strong dir="ltr">{money(payTarget.monthly_revenues?.client_share)}</strong></span>
                  <span>{t("paidAmount")}: <strong dir="ltr" className="text-green-400">{money(payTarget.amount_paid)}</strong></span>
                  <span>{t("remainingAmount")}: <strong dir="ltr" className="text-red-400">{money(payTarget.remaining)}</strong></span>
                </div>
              </div>

              <div className="space-y-1 text-right">
                <Label className="text-xs text-slate-300">{lang === "ar" ? "المبلغ المدفوع (USD) *" : "Amount Paid (USD) *"}</Label>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payTarget.remaining}
                  required
                  dir="ltr"
                  defaultValue={payTarget.remaining}
                  className="bg-slate-900 border-slate-700 h-9 text-white text-right"
                />
                <span className="text-xs text-slate-400 block mt-1">{t("quickPayDesc")}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-right">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">{t("transactionDate")}</Label>
                  <Input
                    name="transaction_date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    dir="ltr"
                    className="bg-slate-900 border-slate-700 h-9 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">{t("transferNo")}</Label>
                  <Input
                    name="vodafone_transfer_no"
                    placeholder={lang === "ar" ? "رقم التحويل..." : "Transfer No..."}
                    dir="ltr"
                    className="bg-slate-900 border-slate-700 h-9 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1 text-right">
                <Label className="text-xs text-slate-300">{t("notes")}</Label>
                <Input name="notes" placeholder={lang === "ar" ? "ملاحظات اختيارية..." : "Optional notes..."} className="bg-slate-900 border-slate-700 h-9 text-white" />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="submit" className="w-full bg-primary hover:bg-primary/95 text-white" disabled={addTx.isPending}>
                  {addTx.isPending ? t("loading") : (lang === "ar" ? "تأكيد وتسجيل الدفع" : "Confirm and register payment")}
                </Button>
                <Button type="button" variant="outline" className="w-full border-slate-700 hover:bg-slate-900 text-white" onClick={() => setPayTarget(null)}>{t("cancel")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="bg-slate-900 border border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-right">{t("deleteTxConfirm")}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              {t("deleteTxDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  delTx.mutate(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {lang === "ar" ? "نعم، احذف الدفعة" : "Yes, delete payment"}
            </AlertDialogAction>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">{t("cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

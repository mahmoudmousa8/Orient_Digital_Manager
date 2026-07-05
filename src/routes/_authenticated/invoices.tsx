import { createFileRoute, Link, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Search, Eye, Copy, Trash2, Printer, Calendar, RefreshCw, X, Pencil } from "lucide-react";
import { money, STATUS_AR } from "@/lib/format";
import { createInvoice, duplicateInvoice, deleteInvoice, updateInvoice } from "@/lib/invoices.functions";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
});

type Invoice = {
  id: string;
  invoice_number: string;
  client_id: string;
  status: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled";
  issue_date: string;
  due_date: string;
  currency: string;
  grand_total: number;
  amount_paid: number;
  remaining_balance: number;
  created_at: string;
  clients?: { name: string } | null;
};

const statusVariant: Record<string, string> = {
  draft: "bg-purple-700 text-white rounded-full border-none",
  issued: "bg-blue-600 text-white rounded-full border-none",
  paid: "bg-[#fbbf24] text-black font-bold rounded-full border-none",
  partial: "bg-amber-500 text-white rounded-full border-none",
  overdue: "bg-[#d946ef] text-white rounded-full border-none",
  cancelled: "bg-slate-600 text-slate-100 rounded-full border-none",
};

function InvoicesPage() {
  const { t, lang } = useLanguage();
  const loc = useLocation();
  const isDetailsPage = loc.pathname !== "/invoices" && loc.pathname !== "/invoices/";

  const STATUS_EN: Record<string, string> = {
    draft: "Draft",
    issued: "Issued",
    paid: "Paid",
    partial: "Partially Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
  };

  const getStatusLabel = (status: string) => {
    return lang === "ar" ? (STATUS_AR[status] || status) : (STATUS_EN[status] || status);
  };

  const { isStaff, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const createInvoiceFn = useServerFn(createInvoice);
  const duplicateInvoiceFn = useServerFn(duplicateInvoice);
  const deleteInvoiceFn = useServerFn(deleteInvoice);
  const updateInvoiceFn = useServerFn(updateInvoice);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClient, setFilterClient] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // New Invoice Form state
  const [formClientId, setFormClientId] = useState("");
  const [formMonth, setFormMonth] = useState("");
  const [formInvoiceNo, setFormInvoiceNo] = useState("");
  const [formIssueDate, setFormIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [formDueDate, setFormDueDate] = useState(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [formItems, setFormItems] = useState<Array<any>>([]);
  const [formTax, setFormTax] = useState<number | string>(0);
  const [formDiscount, setFormDiscount] = useState<number | string>(0);
  const [formNotes, setFormNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Queries
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", isStaff],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      
      if (!isStaff) {
        // RLS will restrict, but let's filter client-side too
        const { data: clientRecs } = await supabase.from("clients").select("id").eq("user_id", user?.id || "");
        const clientIds = (clientRecs ?? []).map((c) => c.id);
        if (clientIds.length > 0) {
          q = q.in("client_id", clientIds);
        } else {
          return [];
        }
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return data as Invoice[];
    },
  });

  // Generate unique invoice number
  function generateInvoiceNumber() {
    const random = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
    setFormInvoiceNo(`INV-${dateStr}-${random}`);
  }

  // Load monthly revenues automatically
  async function loadMonthRevenues() {
    if (!formClientId || !formMonth) {
      toast.error(lang === "ar" ? "يرجى اختيار العميل والشهر أولاً" : "Please select the client and month first");
      return;
    }
    setBusy(true);
    try {
      // Calculate 2 months prior for revenues (e.g. invoice month 7 gets revenues of month 5)
      const [year, month] = formMonth.split("-").map(Number);
      const priorDate = new Date(year, month - 1 - 2, 1);
      const priorYear = priorDate.getFullYear();
      const priorMonth = String(priorDate.getMonth() + 1).padStart(2, '0');
      const priorMonthStr = `${priorYear}-${priorMonth}`;
      const start = priorMonthStr + "-01";
      
      // Get all channels belonging to this client
      const { data: clientChannels, error: chErr } = await supabase
        .from("channels")
        .select("id")
        .eq("client_id", formClientId);
        
      if (chErr) throw chErr;
      
      const channelIds = (clientChannels ?? []).map((c) => c.id);
      if (channelIds.length === 0) {
        toast.info(lang === "ar" ? "لا توجد قنوات مسجلة لهذا العميل" : "No channels registered for this client");
        setBusy(false);
        return;
      }

      const { data: revenues, error } = await supabase
        .from("monthly_revenues")
        .select("*, channels(name)")
        .eq("period_month", start)
        .is("invoice_id", null)
        .in("channel_id", channelIds);

      if (error) throw error;
      if (!revenues || revenues.length === 0) {
        toast.info(
          lang === "ar" 
            ? `لا توجد إيرادات غير مفوترة لهذا العميل في شهر أرباحه المحدد (${priorMonthStr})` 
            : `No unbilled revenues found for this client in the selected earnings month (${priorMonthStr})`
        );
        setBusy(false);
        return;
      }

      const mapped = revenues.map((r: any) => ({
        revenueId: r.id,
        channelId: r.channel_id,
        description: lang === "ar" ? `أرباح قناة (${r.channels?.name}) - شهر ${priorMonthStr}` : `Earnings for channel (${r.channels?.name}) - Month ${priorMonthStr}`,
        views: Number(r.views || 0),
        amount: Number(r.client_share || 0),
        clientPercentage: Number(r.client_percentage || 50),
        clientShare: Number(r.client_share || 0),
        companyShare: Number(r.company_share || 0),
      }));

      setFormItems([...formItems, ...mapped]);
      toast.success(
        lang === "ar" 
          ? `تم تحميل ${revenues.length} من بنود أرباح القنوات` 
          : `Successfully loaded ${revenues.length} channel earnings items`
      );
    } catch (err: any) {
      toast.error(err.message || (lang === "ar" ? "فشل تحميل الإيرادات" : "Failed to load revenues"));
    } finally {
      setBusy(false);
    }
  }

  const addCustomItem = () => {
    setFormItems([
      ...formItems,
      {
        revenueId: null,
        channelId: null,
        description: lang === "ar" ? "رسوم إدارية / خدمات إضافية" : "Admin Fees / Extra Services",
        views: "",
        amount: "",
        clientPercentage: null,
        clientShare: "",
        companyShare: 0,
      },
    ]);
  };

  const removeFormItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateFormItem = (index: number, key: string, val: any) => {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [key]: val };
    
    // Recalculate if values change
    if (key === "amount") {
      updated[index].clientShare = val;
    }
    setFormItems(updated);
  };

  // Calculations
  const calculated = useMemo(() => {
    const subtotal = formItems.reduce((s, it) => s + Number(it.clientShare || 0), 0);
    const discountAmount = Number(((subtotal * Number(formDiscount || 0)) / 100).toFixed(2));
    const taxAmount = Number(((subtotal - discountAmount) * Number(formTax || 0) / 100).toFixed(2));
    const total = subtotal - discountAmount + taxAmount;
    return { subtotal, discountAmount, taxAmount, total };
  }, [formItems, formTax, formDiscount]);

  // Mutations
  const createMut = useMutation({
    mutationFn: async () => {
      const itemsPayload = formItems.map((it) => ({
        ...it,
        views: Number(it.views || 0),
        amount: Number(it.amount || 0),
        clientShare: Number(it.clientShare || 0),
        companyShare: Number(it.companyShare || 0),
      }));
      return createInvoiceFn({
        data: {
          clientId: formClientId,
          invoiceNumber: formInvoiceNo,
          issueDate: formIssueDate,
          dueDate: formDueDate,
          currency: "USD",
          taxRate: Number(formTax || 0),
          discountRate: Number(formDiscount || 0),
          notes: formNotes,
          items: itemsPayload,
        },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(lang === "ar" ? "تم إنشاء الفاتورة بنجاح" : "Invoice created successfully");
      setCreateOpen(false);
      resetForm();
      navigate({ to: "/invoices/$id", params: { id: res.id } });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editingInvoice) return;
      const itemsPayload = formItems.map((it) => ({
        ...it,
        views: Number(it.views || 0),
        amount: Number(it.amount || 0),
        clientShare: Number(it.clientShare || 0),
        companyShare: Number(it.companyShare || 0),
      }));
      return updateInvoiceFn({
        data: {
          id: editingInvoice.id,
          invoiceNumber: formInvoiceNo,
          issueDate: formIssueDate,
          dueDate: formDueDate,
          status: editingInvoice.status,
          currency: "USD",
          taxRate: Number(formTax || 0),
          discountRate: Number(formDiscount || 0),
          notes: formNotes,
          items: itemsPayload,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(lang === "ar" ? "تم تعديل الفاتورة بنجاح" : "Invoice updated successfully");
      setCreateOpen(false);
      setEditingInvoice(null);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const dupMut = useMutation({
    mutationFn: async (id: string) => duplicateInvoiceFn({ data: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(lang === "ar" ? "تم نسخ الفاتورة كمسودة" : "Invoice duplicated as draft");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => deleteInvoiceFn({ data: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(lang === "ar" ? "تم حذف الفاتورة بنجاح" : "Invoice deleted successfully");
      setDeleteTargetId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  function resetForm() {
    setFormClientId("");
    setFormMonth("");
    generateInvoiceNumber();
    setFormItems([]);
    setFormTax(0);
    setFormDiscount(0);
    setFormNotes("");
  }

  const openCreateDialog = () => {
    setEditingInvoice(null);
    resetForm();
    setCreateOpen(true);
  };

  const openEditDialog = async (inv: Invoice) => {
    setBusy(true);
    setEditingInvoice(inv);
    setFormClientId(inv.client_id);
    setFormInvoiceNo(inv.invoice_number);
    setFormIssueDate(inv.issue_date);
    setFormDueDate(inv.due_date);
    setFormTax((inv as any).tax_rate ?? 0);
    setFormDiscount((inv as any).discount_rate ?? 0);
    setFormNotes((inv as any).notes ?? "");
    
    try {
      const { data: items, error } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", inv.id);
      if (error) throw error;
      
      const mapped = (items ?? []).map((it) => ({
        revenueId: it.revenue_id,
        channelId: it.channel_id,
        description: it.description,
        views: it.views,
        amount: it.amount,
        clientPercentage: it.client_percentage,
        clientShare: it.client_share,
        companyShare: it.company_share,
      }));
      setFormItems(mapped);
      setCreateOpen(true);
    } catch (err: any) {
      toast.error(lang === "ar" ? "فشل تحميل بنود الفاتورة" : "Failed to load invoice items");
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (filterStatus !== "all" && inv.status !== filterStatus) return false;
      if (filterClient !== "all" && inv.client_id !== filterClient) return false;
      if (q && !inv.invoice_number.toLowerCase().includes(q) && !(inv.clients?.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, search, filterStatus, filterClient]);

  if (isDetailsPage) {
    return <Outlet />;
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <FileText className="w-8 h-8 text-primary" />
            {lang === "ar" ? "الفواتير المالية" : "Financial Invoices"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isStaff 
              ? (lang === "ar" ? "إدارة فواتير العملاء وتوزيع الأرباح والمدفوعات" : "Manage client invoices, revenue splits, and payments") 
              : (lang === "ar" ? "فواتيرك المستحقة وإيصالات السداد" : "Your outstanding invoices and payment receipts")}
          </p>
        </div>
        {isStaff && (
          <Button onClick={openCreateDialog} className="btn-header-action">
            <Plus className="w-4 h-4 ml-1" /> {lang === "ar" ? "فاتورة جديدة" : "New Invoice"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={lang === "ar" ? "بحث برقم الفاتورة أو العميل…" : "Search by invoice number or client..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input-padding"
          />
        </div>
        {isStaff && (
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-48 bg-slate-900 border-slate-700">
              <SelectValue placeholder={lang === "ar" ? "اختر العميل" : "Select client"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل العملاء" : "All clients"}</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-slate-900 border-slate-700">
            <SelectValue placeholder={lang === "ar" ? "الحالة" : "Status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</SelectItem>
            {["draft", "issued", "paid", "partial", "overdue", "cancelled"].map((s) => (
              <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{lang === "ar" ? "رقم الفاتورة" : "Invoice No."}</TableHead>
                {isStaff && <TableHead className="text-right">{lang === "ar" ? "العميل" : "Client"}</TableHead>}
                <TableHead className="text-right">{lang === "ar" ? "تاريخ الإصدار" : "Issue Date"}</TableHead>
                <TableHead className="text-right">{lang === "ar" ? "تاريخ الاستحقاق" : "Due Date"}</TableHead>
                <TableHead className="text-left">{lang === "ar" ? "الإجمالي" : "Total"}</TableHead>
                <TableHead className="text-left">{lang === "ar" ? "المدفوع" : "Paid"}</TableHead>
                <TableHead className="text-left">{lang === "ar" ? "المتبقي" : "Remaining"}</TableHead>
                <TableHead className="text-right">{lang === "ar" ? "الحالة" : "Status"}</TableHead>
                <TableHead className="text-left">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 9 : 8} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {lang === "ar" ? "جاري تحميل الفواتير…" : "Loading invoices..."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 9 : 8} className="text-center text-muted-foreground py-12">
                    {lang === "ar" ? "لا توجد فواتير مطابقة" : "No matching invoices found"}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-bold text-right">{inv.invoice_number}</TableCell>
                  {isStaff && <TableCell className="text-right">{inv.clients?.name ?? "—"}</TableCell>}
                  <TableCell dir="ltr" className="text-right">{inv.issue_date}</TableCell>
                  <TableCell dir="ltr" className="text-right">{inv.due_date}</TableCell>
                  <TableCell dir="ltr" className="text-left font-bold">{money(inv.grand_total)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white">{money(inv.amount_paid)}</TableCell>
                  <TableCell dir="ltr" className="text-left text-white font-bold">{money(inv.remaining_balance)}</TableCell>
                  <TableCell className="text-right text-white font-medium">
                    {getStatusLabel(inv.status)}
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" asChild>
                        <Link to="/invoices/$id" params={{ id: inv.id }}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      {isStaff && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(inv)} title={lang === "ar" ? "تعديل" : "Edit"}>
                            <Pencil className="w-4 h-4 text-slate-300 hover:text-white" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => dupMut.mutate(inv.id)} title={lang === "ar" ? "نسخ" : "Duplicate"}>
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteTargetId(inv.id)}>
                            <Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) { setEditingInvoice(null); resetForm(); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 text-slate-100" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="text-white text-right font-bold">
              {editingInvoice 
                ? (lang === "ar" ? "تعديل الفاتورة" : "Edit Invoice") 
                : (lang === "ar" ? "فاتورة جديدة للعميل" : "New Invoice for Client")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="create-client" className="text-slate-300">{lang === "ar" ? "العميل *" : "Client *"}</Label>
                <Select value={formClientId} onValueChange={setFormClientId} disabled={!!editingInvoice}>
                  <SelectTrigger id="create-client" className="bg-slate-900 border-slate-700 text-white">
                    <SelectValue placeholder={lang === "ar" ? "اختر العميل" : "Select client"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-invoice-no" className="text-slate-300">{lang === "ar" ? "رقم الفاتورة *" : "Invoice Number *"}</Label>
                <div className="flex gap-1">
                  <Input
                    id="create-invoice-no"
                    value={formInvoiceNo}
                    onChange={(e) => setFormInvoiceNo(e.target.value)}
                    required
                    dir="ltr"
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                  <Button variant="outline" onClick={generateInvoiceNumber} size="icon" type="button" title={lang === "ar" ? "توليد رقم" : "Generate No."} className="bg-slate-900 border-slate-700 text-white">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-issue-date" className="text-slate-300">{lang === "ar" ? "تاريخ الإصدار *" : "Issue Date *"}</Label>
                <Input
                  id="create-issue-date"
                  type="date"
                  value={formIssueDate}
                  onChange={(e) => setFormIssueDate(e.target.value)}
                  required
                  dir="ltr"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="create-due-date" className="text-slate-300">{lang === "ar" ? "تاريخ الاستحقاق *" : "Due Date *"}</Label>
                <Input
                  id="create-due-date"
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  required
                  dir="ltr"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="load-month" className="text-slate-300">{lang === "ar" ? "جلب أرباح شهر معين تلقائياً" : "Fetch earnings for specific month"}</Label>
                <Input
                  id="load-month"
                  type="month"
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                  dir="ltr"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="flex items-end">
                <Button
                  variant="secondary"
                  className="w-full bg-slate-800 text-white hover:bg-slate-700"
                  onClick={loadMonthRevenues}
                  disabled={busy}
                  type="button"
                >
                  {busy ? t("loading") : (lang === "ar" ? "تحميل الإيرادات" : "Load Revenues")}
                </Button>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-200">{lang === "ar" ? "بنود الفاتورة" : "Invoice Items"}</span>
                <Button variant="outline" size="sm" onClick={addCustomItem} type="button" className="border-slate-700 text-white bg-slate-800 hover:bg-slate-700">
                  <Plus className="w-3.5 h-3.5 ml-1" /> {lang === "ar" ? "إضافة بند يدوي" : "Add Custom Item"}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === "ar" ? "البند / الوصف" : "Item / Description"}</TableHead>
                    <TableHead className="text-center w-24">{lang === "ar" ? "المشاهدات" : "Views"}</TableHead>
                    <TableHead className="text-center w-28">{lang === "ar" ? "المبلغ (USD)" : "Amount (USD)"}</TableHead>
                    <TableHead className="text-center w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        {lang === "ar" ? "لا توجد بنود حالياً. يرجى إضافة بند يدوي أو تحميل إيرادات الشهر." : "No items currently. Please add a custom item or load monthly revenues."}
                      </TableCell>
                    </TableRow>
                  )}
                  {formItems.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          value={it.description}
                          onChange={(e) => updateFormItem(idx, "description", e.target.value)}
                          required
                          className="bg-slate-950 border-slate-800 text-white"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={it.views}
                          onChange={(e) => updateFormItem(idx, "views", e.target.value)}
                          dir="ltr"
                          className="text-center bg-slate-950 border-slate-800 text-white"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={it.amount}
                          onChange={(e) => updateFormItem(idx, "amount", e.target.value)}
                          required
                          dir="ltr"
                          className="text-center font-bold bg-slate-950 border-slate-800 text-white"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeFormItem(idx)}
                          className="text-destructive hover:bg-destructive/5"
                          type="button"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="create-tax" className="text-slate-300">{lang === "ar" ? "الضريبة (%)" : "Tax (%)"}</Label>
                    <Input
                      id="create-tax"
                      type="number"
                      min="0"
                      max="100"
                      value={formTax}
                      onChange={(e) => setFormTax(e.target.value)}
                      dir="ltr"
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-discount" className="text-slate-300">{lang === "ar" ? "الخصم (%)" : "Discount (%)"}</Label>
                    <Input
                      id="create-discount"
                      type="number"
                      min="0"
                      max="100"
                      value={formDiscount}
                      onChange={(e) => setFormDiscount(e.target.value)}
                      dir="ltr"
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="create-notes" className="text-slate-300">{lang === "ar" ? "ملاحظات الفاتورة" : "Invoice Notes"}</Label>
                  <Input
                    id="create-notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder={lang === "ar" ? "شروط إضافية أو تعليمات الدفع" : "Additional terms or payment instructions"}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-muted/20 p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>{lang === "ar" ? "المجموع الفرعي:" : "Subtotal:"}</span>
                  <span className="font-bold text-white" dir="ltr">{money(calculated.subtotal)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1 text-muted-foreground">
                  <span>{lang === "ar" ? "الخصم" : "Discount"} ({formDiscount}%):</span>
                  <span dir="ltr">-{money(calculated.discountAmount)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1 text-muted-foreground">
                  <span>{lang === "ar" ? "الضريبة" : "Tax"} ({formTax}%):</span>
                  <span dir="ltr">+{money(calculated.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-1 text-primary">
                  <span>{lang === "ar" ? "الإجمالي النهائي (USD):" : "Grand Total (USD):"}</span>
                  <span dir="ltr">{money(calculated.total)}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} type="button" className="border-slate-700 text-white hover:bg-slate-900 bg-slate-950">{t("cancel")}</Button>
            <Button 
              onClick={() => editingInvoice ? updateMut.mutate() : createMut.mutate()} 
              disabled={createMut.isPending || updateMut.isPending || formItems.length === 0}
            >
              {createMut.isPending || updateMut.isPending 
                ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") 
                : (lang === "ar" ? "حفظ الفاتورة" : "Save Invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog for Delete Confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="bg-slate-900 border border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-right font-bold">{lang === "ar" ? "هل أنت متأكد تماماً من حذف هذه الفاتورة؟" : "Are you absolutely sure you want to delete this invoice?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              {lang === "ar" ? "هذا الإجراء سيقوم بحذف الفاتورة نهائياً وإلغاء ارتباط كافة بنود أرباح القنوات المرتبطة بها لتصبح قابلة للفوترة من جديد." : "This action will permanently delete the invoice and release all associated channel revenue items to be billed again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogAction
              onClick={() => deleteTargetId && delMut.mutate(deleteTargetId)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {lang === "ar" ? "نعم، احذف الفاتورة" : "Yes, delete invoice"}
            </AlertDialogAction>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">{t("cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

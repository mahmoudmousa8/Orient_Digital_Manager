import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users, Search } from "lucide-react";
import { money, parsePaymentMethod } from "@/lib/format";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});

type Client = {
  id: string; name: string; phone: string | null; vodafone_cash: string | null;
  email: string | null; notes: string | null; user_id: string | null;
};

function ClientsPage() {
  const { isStaff } = useAuth();
  const { t, lang } = useLanguage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filterPayment, setFilterPayment] = useState("all"); // all, instapay, wallet
  const [paymentType, setPaymentType] = useState<"wallet" | "instapay">("wallet");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: stats = {} } = useQuery({
    queryKey: ["clients-stats"],
    queryFn: async () => {
      const { data: ch } = await supabase.from("channels").select("client_id");
      const { data: rv } = await supabase.from("monthly_revenues").select("total_revenue, client_share, channels!inner(client_id)");
      const out: Record<string, { channels: number; revenue: number; payout: number }> = {};
      (ch ?? []).forEach((r: any) => {
        out[r.client_id] ??= { channels: 0, revenue: 0, payout: 0 };
        out[r.client_id].channels++;
      });
      (rv ?? []).forEach((r: any) => {
        const cid = r.channels?.client_id; if (!cid) return;
        out[cid] ??= { channels: 0, revenue: 0, payout: 0 };
        out[cid].revenue += Number(r.total_revenue ?? 0);
        out[cid].payout += Number(r.client_share ?? 0);
      });
      return out;
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<Client>) => {
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(editing ? "تم تحديث العميل" : "تم إضافة العميل");
      setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("تم حذف العميل"); },
    onError: (e: any) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pType = String(fd.get("payment_type"));
    const pValue = String(fd.get("payment_value") || "").trim();
    
    let vodafoneCash = null;
    if (pValue) {
      vodafoneCash = pType === "instapay" ? `إنستاباي: ${pValue}` : `محفظة: ${pValue}`;
    }

    save.mutate({
      name: String(fd.get("name") || ""),
      phone: String(fd.get("phone") || "") || null,
      vodafone_cash: vodafoneCash,
      email: String(fd.get("email") || "") || null,
      notes: String(fd.get("notes") || "") || null,
    });
  }

  const filtered = useMemo(() => {
    let list = clients;
    
    // 1. Payment method filter
    if (filterPayment === "instapay") {
      list = list.filter((c) => c.vodafone_cash?.startsWith("إنستاباي:"));
    } else if (filterPayment === "wallet") {
      list = list.filter((c) => c.vodafone_cash && !c.vodafone_cash.startsWith("إنستاباي:"));
    }

    // 2. Search query filter
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.vodafone_cash ?? "").toLowerCase().includes(q)
    );
  }, [clients, search, filterPayment]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setEditing(null);
    } else if (!editing) {
      setPaymentType("wallet");
    }
  };

  const handleEditClick = (c: Client) => {
    setEditing(c);
    const parsed = parsePaymentMethod(c.vodafone_cash);
    setPaymentType(parsed.type);
    setOpen(true);
  };

  if (!isStaff) return <div className="text-muted-foreground">{lang === "ar" ? "هذه الصفحة متاحة للموظفين فقط." : "This page is only available for staff."}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Users className="w-8 h-8 text-primary" />
            {t("clients")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {lang === "ar" ? "إدارة بيانات العملاء وقنواتهم" : "Manage clients data and their channels"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="btn-header-action"><Plus className="w-4 h-4 ml-1" /> {t("newClient")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-slate-950 border-slate-800 text-slate-100" dir={lang === "ar" ? "rtl" : "ltr"}>
            <DialogHeader><DialogTitle className="text-white text-right font-bold">{editing ? t("editClient") : t("newClient")}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 text-right">
              <div className="space-y-2"><Label className="text-slate-300">{lang === "ar" ? "الاسم *" : "Name *"}</Label><Input name="name" required defaultValue={editing?.name} className="bg-slate-900 border-slate-700" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label className="text-slate-300">{t("clientPhone")}</Label><Input name="phone" defaultValue={editing?.phone ?? ""} dir="ltr" className="bg-slate-900 border-slate-700" /></div>
                <div className="space-y-2">
                  <Label className="text-slate-300">{t("clientWalletInstapay")}</Label>
                  <div className="flex gap-2">
                    <Select value={paymentType} onValueChange={(val: any) => setPaymentType(val)} name="payment_type">
                      <SelectTrigger className="w-[100px] bg-slate-900 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wallet">{t("wallet")}</SelectItem>
                        <SelectItem value="instapay">{t("instapay")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input 
                      name="payment_value" 
                      defaultValue={parsePaymentMethod(editing?.vodafone_cash).value} 
                      placeholder={paymentType === "instapay" ? (lang === "ar" ? "عنوان InstaPay..." : "InstaPay address...") : (lang === "ar" ? "رقم المحفظة..." : "Wallet number...")}
                      dir="ltr"
                      className="flex-1 bg-slate-900 border-slate-700"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2"><Label className="text-slate-300">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label><Input name="email" type="email" defaultValue={editing?.email ?? ""} dir="ltr" className="bg-slate-900 border-slate-700" /></div>
              <div className="space-y-2"><Label className="text-slate-300">{t("notes")}</Label><Textarea name="notes" defaultValue={editing?.notes ?? ""} className="bg-slate-900 border-slate-700" /></div>
              <DialogFooter className="gap-2">
                <Button type="submit" disabled={save.isPending}>{save.isPending ? t("loading") : t("save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("searchClientPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
        </div>

        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="w-48 bg-slate-900 border-slate-700">
            <SelectValue placeholder={t("paymentType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل طرق الدفع" : "All payment methods"}</SelectItem>
            <SelectItem value="instapay">{lang === "ar" ? "إنستاباي فقط" : "InstaPay only"}</SelectItem>
            <SelectItem value="wallet">{lang === "ar" ? "محفظة إلكترونية فقط" : "E-Wallet only"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-12">#</TableHead>
                <TableHead className="text-right">{lang === "ar" ? "الاسم" : "Name"}</TableHead>
                <TableHead className="text-right">{t("clientPhone")}</TableHead>
                <TableHead className="text-right">{t("clientWalletInstapay")}</TableHead>
                <TableHead className="text-right">{t("clientEmail")}</TableHead>
                <TableHead className="text-center">{t("channelsCount")}</TableHead>
                <TableHead className="text-left">{t("totalRevenue")}</TableHead>
                <TableHead className="text-left">{t("clientShare")}</TableHead>
                <TableHead className="text-left">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center">{t("loading")}</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{lang === "ar" ? "لا يوجد عملاء" : "No clients found"}</TableCell></TableRow>}
              {filtered.map((c, index) => {
                const s = (stats as any)[c.id] ?? { channels: 0, revenue: 0, payout: 0 };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold text-slate-400 text-right">{index + 1}</TableCell>
                    <TableCell className="font-medium text-right">{c.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">{c.phone || "—"}</TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {c.vodafone_cash ? (
                        (() => {
                          const parsed = parsePaymentMethod(c.vodafone_cash);
                          return (
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-[11px] text-slate-300 font-medium truncate max-w-[150px]" title={parsed.value}>
                                {parsed.value}
                              </span>
                              {parsed.type === "instapay" ? (
                                <span className="text-[9px] bg-purple-500/15 text-purple-300 font-extrabold px-1.5 py-0.5 rounded border border-purple-500/20">
                                  {t("instapay")}
                                </span>
                              ) : (
                                <span className="text-[9px] bg-sky-500/15 text-sky-300 font-extrabold px-1.5 py-0.5 rounded border border-sky-500/20">
                                  {t("wallet")}
                                </span>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell dir="ltr" className="text-right">{c.email || "—"}</TableCell>
                    <TableCell dir="ltr" className="font-medium text-center">{s.channels}</TableCell>
                    <TableCell dir="ltr" className="text-white font-medium text-left">{money(s.revenue)}</TableCell>
                    <TableCell dir="ltr" className="text-white font-medium text-left">{money(s.payout)}</TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => handleEditClick(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(c.id)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" /></Button>
                      </div>
                    </TableCell>
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
            <AlertDialogTitle className="text-white text-right">{lang === "ar" ? "هل أنت متأكد تماماً من حذف هذا العميل؟" : "Are you absolutely sure you want to delete this client?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              {lang === "ar" ? "هذا الإجراء سيقوم بحذف العميل نهائياً وكافة القنوات التابعة له من قاعدة البيانات. يرجى توخي الحذر الشديد!" : "This action will permanently delete the client and all associated channels from the database. Please proceed with caution!"}
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
              {lang === "ar" ? "نعم، احذف العميل" : "Yes, delete client"}
            </AlertDialogAction>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">{t("cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

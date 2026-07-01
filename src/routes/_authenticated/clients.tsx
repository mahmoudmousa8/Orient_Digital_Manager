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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users, Search } from "lucide-react";
import { money } from "@/lib/format";
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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
    save.mutate({
      name: String(fd.get("name") || ""),
      phone: String(fd.get("phone") || "") || null,
      vodafone_cash: String(fd.get("vodafone_cash") || "") || null,
      email: String(fd.get("email") || "") || null,
      notes: String(fd.get("notes") || "") || null,
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q));
  }, [clients, search]);

  if (!isStaff) return <div className="text-muted-foreground">هذه الصفحة متاحة للموظفين فقط.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Users className="w-8 h-8 text-primary" />
            العملاء
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">إدارة بيانات العملاء وقنواتهم</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="btn-header-action"><Plus className="w-4 h-4 ml-1" /> عميل جديد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل عميل" : "عميل جديد"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>الاسم *</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>رقم الهاتف</Label><Input name="phone" defaultValue={editing?.phone ?? ""} dir="ltr" /></div>
                <div className="space-y-2"><Label>إنستاباي / محفظة إلكترونية</Label><Input name="vodafone_cash" defaultValue={editing?.vodafone_cash ?? ""} placeholder="عنوان InstaPay أو رقم المحفظة..." dir="ltr" /></div>
              </div>
              <div className="space-y-2"><Label>البريد الإلكتروني</Label><Input name="email" type="email" defaultValue={editing?.email ?? ""} dir="ltr" /></div>
              <div className="space-y-2"><Label>ملاحظات</Label><Textarea name="notes" defaultValue={editing?.notes ?? ""} /></div>
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? "..." : "حفظ"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو البريد أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الهاتف</TableHead>
                <TableHead className="text-right">إنستاباي / محفظة</TableHead>
                <TableHead className="text-right">البريد</TableHead>
                <TableHead className="text-center">عدد القنوات</TableHead>
                <TableHead className="text-left">إجمالي الإيرادات</TableHead>
                <TableHead className="text-left">إجمالي المستحقات</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center">جاري التحميل…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا يوجد عملاء</TableCell></TableRow>}
              {filtered.map((c) => {
                const s = (stats as any)[c.id] ?? { channels: 0, revenue: 0, payout: 0 };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-right">{c.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">{c.phone || "—"}</TableCell>
                    <TableCell dir="ltr" className="text-right">{c.vodafone_cash || "—"}</TableCell>
                    <TableCell dir="ltr" className="text-right">{c.email || "—"}</TableCell>
                    <TableCell dir="ltr" className="font-medium text-center">{s.channels}</TableCell>
                    <TableCell dir="ltr" className="text-white font-medium text-left">{money(s.revenue)}</TableCell>
                    <TableCell dir="ltr" className="text-white font-medium text-left">{money(s.payout)}</TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
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
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد تماماً من حذف هذا العميل؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء سيقوم بحذف العميل نهائياً وكافة القنوات التابعة له من قاعدة البيانات. يرجى توخي الحذر الشديد!
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
              نعم، احذف العميل
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

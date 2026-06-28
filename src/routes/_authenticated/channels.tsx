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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Youtube, ExternalLink, Search } from "lucide-react";
import { STATUS_AR } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/channels")({
  component: ChannelsPage,
});

type Channel = {
  id: string; client_id: string; name: string; link: string | null;
  client_percentage: number; status: "active" | "paused" | "suspended" | "closed";
  clients?: { name: string } | null;
};

const statusVariant: Record<string, string> = {
  active: "bg-[#fbbf24] text-black font-bold rounded-full border-none",
  paused: "bg-amber-500 text-white rounded-full border-none",
  suspended: "bg-[#d946ef] text-white rounded-full border-none",
  closed: "bg-slate-600 text-slate-100 rounded-full border-none",
};

function ChannelsPage() {
  const { isStaff } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [status, setStatus] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Channel[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: any) => {
      if (editing) {
        const { error } = await supabase.from("channels").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("channels").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); toast.success("تم الحفظ"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); toast.success("تم الحذف"); },
    onError: (e: any) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    save.mutate({
      client_id: clientId || editing?.client_id,
      name: String(fd.get("name")),
      link: String(fd.get("link") || "") || null,
      client_percentage: Number(fd.get("client_percentage")),
      status,
    });
  }

  function openNew() { setEditing(null); setClientId(""); setStatus("active"); setOpen(true); }
  function openEdit(c: Channel) { setEditing(c); setClientId(c.client_id); setStatus(c.status); setOpen(true); }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterClient !== "all" && c.client_id !== filterClient) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.clients?.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [channels, search, filterStatus, filterClient]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Youtube className="w-8 h-8 text-primary" />
            القنوات
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">{isStaff ? "إدارة قنوات اليوتيوب لكل عميل" : "قنواتك المسجلة"}</p>
        </div>
        {isStaff && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="btn-header-action"><Plus className="w-4 h-4 ml-1" /> قناة جديدة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>{editing ? "تعديل قناة" : "قناة جديدة"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>العميل *</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>اسم القناة *</Label><Input name="name" required defaultValue={editing?.name} /></div>
                <div className="space-y-2"><Label>رابط القناة</Label><Input name="link" type="url" defaultValue={editing?.link ?? ""} dir="ltr" placeholder="https://youtube.com/@channel" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>نسبة العميل % *</Label><Input name="client_percentage" type="number" step="0.01" min="0" max="100" required defaultValue={editing?.client_percentage ?? 50} dir="ltr" /></div>
                  <div className="space-y-2">
                    <Label>الحالة</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["active","paused","suspended","closed"].map(s => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter><Button type="submit" disabled={save.isPending}>حفظ</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث باسم القناة أو العميل…" value={search} onChange={(e) => setSearch(e.target.value)} className="search-input-padding" />
        </div>
        {isStaff && (
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العملاء</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {["active","paused","suspended","closed"].map(s => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">القناة</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-center">نسبة العميل</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الرابط</TableHead>
                {isStaff && <TableHead className="text-left">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center">جاري التحميل…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد قنوات</TableCell></TableRow>}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-right">{c.name}</TableCell>
                  <TableCell className="text-right">{c.clients?.name ?? "—"}</TableCell>
                  <TableCell dir="ltr" className="text-center text-white">{c.client_percentage}%</TableCell>
                  <TableCell className="text-right text-white font-medium">{STATUS_AR[c.status]}</TableCell>
                  <TableCell className="text-right">{c.link ? <a href={c.link} target="_blank" rel="noreferrer" className="text-slate-100 hover:text-white inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />فتح</a> : "—"}</TableCell>
                  {isStaff && <TableCell className="text-left">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(c.id)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" /></Button>
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
            <AlertDialogTitle>هل أنت متأكد تماماً من حذف هذه القناة؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء سيقوم بحذف القناة نهائياً من النظام. سيتم الاحتفاظ بجميع السجلات المالية السابقة المرتبطة بها.
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
              نعم، احذف القناة
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

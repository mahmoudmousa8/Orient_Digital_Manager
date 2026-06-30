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
import { Checkbox } from "@/components/ui/checkbox";
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
  id: string;
  client_id: string;
  name: string;
  link: string | null;
  client_percentage: number;
  status: "active" | "paused" | "suspended" | "closed";
  clients?: { name: string } | null;
  system_id?: string | null;
  system_percentage?: number | null;
  company_percentage?: number | null;
  is_monetized?: boolean;
  systems?: { name: string } | null;
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
  const [filterSystem, setFilterSystem] = useState<string>("all");
  const [filterMonetized, setFilterMonetized] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // New fields state
  const [systemId, setSystemId] = useState<string>("none");
  const [newSystemName, setNewSystemName] = useState<string>("");
  const [isMonetized, setIsMonetized] = useState<boolean>(true);
  const [clientPercentage, setClientPercentage] = useState<number>(50);
  const [systemPercentage, setSystemPercentage] = useState<number>(0);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: systems = [] } = useQuery({
    queryKey: ["systems"],
    queryFn: async () => {
      const { data } = await supabase.from("systems").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*, clients(name), systems(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Channel[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ payload, newSystemName }: { payload: any; newSystemName?: string }) => {
      let finalPayload = { ...payload };
      if (newSystemName) {
        // Check if system already exists (case-insensitive)
        const { data: existing } = await supabase
          .from("systems")
          .select("id")
          .eq("name", newSystemName.trim())
          .maybeSingle();

        if (existing) {
          finalPayload.system_id = existing.id;
        } else {
          const { data: newSys, error: sysErr } = await supabase
            .from("systems")
            .insert({ name: newSystemName.trim() })
            .select("id")
            .single();
          if (sysErr) throw sysErr;
          finalPayload.system_id = newSys.id;
        }
      }

      if (editing) {
        const { error } = await supabase.from("channels").update(finalPayload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("channels").insert(finalPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["systems"] });
      toast.success("تم الحفظ");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("تم الحذف");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const companyPercentage = 100 - clientPercentage - (systemId !== "none" ? systemPercentage : 0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const payload: any = {
      client_id: clientId || editing?.client_id,
      name: String(new FormData(e.currentTarget).get("name")),
      link: String(new FormData(e.currentTarget).get("link") || "") || null,
      client_percentage: clientPercentage,
      system_percentage: systemId !== "none" ? systemPercentage : 0,
      company_percentage: companyPercentage,
      status,
      is_monetized: isMonetized,
    };

    if (systemId !== "none" && systemId !== "new") {
      payload.system_id = systemId;
    } else if (systemId === "none") {
      payload.system_id = null;
    }

    save.mutate({
      payload,
      newSystemName: systemId === "new" ? newSystemName : undefined,
    });
  }

  function openNew() {
    setEditing(null);
    setClientId("");
    setStatus("active");
    setSystemId("none");
    setNewSystemName("");
    setIsMonetized(true);
    setClientPercentage(50);
    setSystemPercentage(0);
    setOpen(true);
  }

  function openEdit(c: Channel) {
    setEditing(c);
    setClientId(c.client_id);
    setStatus(c.status);
    setSystemId(c.system_id || "none");
    setNewSystemName("");
    setIsMonetized(c.is_monetized ?? true);
    setClientPercentage(c.client_percentage);
    setSystemPercentage(c.system_percentage ?? 0);
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterClient !== "all" && c.client_id !== filterClient) return false;
      if (filterSystem !== "all") {
        if (filterSystem === "none" && c.system_id !== null) return false;
        if (filterSystem !== "none" && c.system_id !== filterSystem) return false;
      }
      if (filterMonetized !== "all") {
        const wantsMonetized = filterMonetized === "yes";
        const isM = c.is_monetized !== false;
        if (wantsMonetized !== isM) return false;
      }
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !(c.clients?.name ?? "").toLowerCase().includes(q) &&
        !(c.systems?.name ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [channels, search, filterStatus, filterClient, filterSystem, filterMonetized]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Youtube className="w-8 h-8 text-primary" />
            القنوات
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isStaff ? "إدارة قنوات اليوتيوب لكل عميل" : "قنواتك المسجلة"}
          </p>
        </div>
        {isStaff && (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openNew} className="btn-header-action">
                <Plus className="w-4 h-4 ml-1" /> قناة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>{editing ? "تعديل قناة" : "قناة جديدة"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>العميل *</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر العميل" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>اسم القناة *</Label>
                  <Input name="name" required defaultValue={editing?.name} />
                </div>
                <div className="space-y-2">
                  <Label>رابط القناة</Label>
                  <Input
                    name="link"
                    type="url"
                    defaultValue={editing?.link ?? ""}
                    dir="ltr"
                    placeholder="https://youtube.com/@channel"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>السيستم</Label>
                    <Select
                      value={systemId}
                      onValueChange={(val) => {
                        setSystemId(val);
                        if (val === "none") setSystemPercentage(0);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر السيستم" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون سيستم (مباشر)</SelectItem>
                        {systems.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="new">+ إضافة سيستم جديد...</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {systemId === "new" && (
                    <div className="space-y-2 animate-fade-in">
                      <Label>اسم السيستم الجديد *</Label>
                      <Input
                        required
                        placeholder="أدخل اسم السيستم الجديد"
                        value={newSystemName}
                        onChange={(e) => setNewSystemName(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className={`grid ${systemId !== "none" ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
                  <div className="space-y-2">
                    <Label>نسبة العميل % *</Label>
                    <Input
                      name="client_percentage"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      required
                      value={clientPercentage}
                      onChange={(e) => setClientPercentage(Number(e.target.value) || 0)}
                      dir="ltr"
                    />
                  </div>

                  {systemId !== "none" && (
                    <div className="space-y-2">
                      <Label>نسبة السيستم % *</Label>
                      <Input
                        name="system_percentage"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        required
                        value={systemPercentage}
                        onChange={(e) => setSystemPercentage(Number(e.target.value) || 0)}
                        dir="ltr"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>نسبة الشركة %</Label>
                    <Input
                      type="number"
                      value={companyPercentage}
                      readOnly
                      disabled
                      className="bg-muted text-white font-bold"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse py-2">
                  <Checkbox
                    id="is_monetized"
                    checked={isMonetized}
                    onCheckedChange={(checked) => setIsMonetized(!!checked)}
                  />
                  <Label htmlFor="is_monetized" className="cursor-pointer text-sm font-medium">
                    مفعلة أرباح
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["active", "paused", "suspended", "closed"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_AR[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={save.isPending}>
                    حفظ
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث باسم القناة أو العميل أو السيستم…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input-padding"
          />
        </div>
        {isStaff && (
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العملاء</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterSystem} onValueChange={setFilterSystem}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السيستمز</SelectItem>
            <SelectItem value="none">مباشر (بدون سيستم)</SelectItem>
            {systems.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {["active", "paused", "suspended", "closed"].map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_AR[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonetized} onValueChange={setFilterMonetized}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">تفعيل الأرباح</SelectItem>
            <SelectItem value="yes">أرباح مفعلة</SelectItem>
            <SelectItem value="no">أرباح غير مفعلة</SelectItem>
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
                {isStaff && <TableHead className="text-right">السيستم</TableHead>}
                <TableHead className="text-center">نسبة العميل</TableHead>
                {isStaff && <TableHead className="text-center">نسبة السيستم</TableHead>}
                {isStaff && <TableHead className="text-center">نسبة الشركة</TableHead>}
                <TableHead className="text-center">تفعيل الأرباح</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الرابط</TableHead>
                {isStaff && <TableHead className="text-left">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 10 : 6} className="text-center">
                    جاري التحميل…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isStaff ? 10 : 6} className="text-center text-muted-foreground py-8">
                    لا توجد قنوات
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-right">{c.name}</TableCell>
                  <TableCell className="text-right">{c.clients?.name ?? "—"}</TableCell>
                  {isStaff && <TableCell className="text-right text-white">{c.systems?.name ?? "مباشر"}</TableCell>}
                  <TableCell dir="ltr" className="text-center text-white">
                    {c.client_percentage}%
                  </TableCell>
                  {isStaff && (
                    <TableCell dir="ltr" className="text-center text-white">
                      {c.system_id ? `${c.system_percentage}%` : "—"}
                    </TableCell>
                  )}
                  {isStaff && (
                    <TableCell dir="ltr" className="text-center text-white">
                      {c.company_percentage ?? (100 - c.client_percentage - (c.system_percentage ?? 0))}%
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    {c.is_monetized !== false ? (
                      <Badge className="bg-primary text-primary-foreground font-bold rounded-full border-none px-2.5 py-0.5 hover:bg-primary">
                        مفعلة
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-600 text-slate-200 rounded-full border-none px-2.5 py-0.5 hover:bg-slate-600">
                        غير مفعلة
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-white font-medium">{STATUS_AR[c.status]}</TableCell>
                  <TableCell className="text-right">
                    {c.link ? (
                      <a
                        href={c.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-100 hover:text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        فتح
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {isStaff && (
                    <TableCell className="text-left">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(c.id)}>
                          <Trash2 className="w-4 h-4 text-slate-300 hover:text-red-400 transition-colors" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
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

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
import { Plus, Pencil, Trash2, Youtube, ExternalLink, Search, Download } from "lucide-react";
import { STATUS_AR } from "@/lib/format";
import { exportChannelsToExcel } from "@/lib/exports";
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
  const { isStaff, isEmployee, isAdmin, user } = useAuth();
  const { t, lang } = useLanguage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  const { data: assignedChannelIds = new Set<string>() } = useQuery({
    queryKey: ["assigned-channel-ids", user?.id],
    enabled: !!user?.id && isEmployee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_publishing_tracker")
        .select("channel_id")
        .eq("assigned_to", user!.id);
      if (error) throw error;
      return new Set(data.map((d) => d.channel_id));
    },
  });
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
    let list = channels;
    if (isEmployee) {
      list = list.filter((c) => assignedChannelIds.has(c.id));
    }
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
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
  }, [channels, search, filterStatus, filterClient, filterSystem, filterMonetized, isEmployee, assignedChannelIds]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Youtube className="w-8 h-8 text-primary" />
            {t("channels")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isStaff ? (lang === "ar" ? "إدارة قنوات اليوتيوب لكل عميل" : "Manage YouTube channels for each client") : (lang === "ar" ? "قنواتك المسجلة" : "Your registered channels")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-primary/20 hover:bg-primary/10 text-white flex items-center gap-1.5"
            onClick={() => exportChannelsToExcel("orient-channels-report.xlsx", filtered, isStaff)}
          >
            <Download className="w-4 h-4 ml-1" /> {t("exportExcel")}
          </Button>

          {isAdmin && (
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={openNew} className="btn-header-action">
                  <Plus className="w-4 h-4 ml-1" /> {t("newChannel")}
                </Button>
              </DialogTrigger>
            <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100" dir={lang === "ar" ? "rtl" : "ltr"}>
              <DialogHeader>
                <DialogTitle className="text-white text-right font-bold">{editing ? t("editChannel") : t("newChannel")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 text-right">
                <div className="space-y-2">
                  <Label className="text-slate-300">{lang === "ar" ? "العميل *" : "Client *"}</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className="bg-slate-900 border-slate-700">
                      <SelectValue placeholder={lang === "ar" ? "اختر العميل" : "Select client"} />
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
                  <Label className="text-slate-300">{lang === "ar" ? "اسم القناة *" : "Channel Name *"}</Label>
                  <Input name="name" required defaultValue={editing?.name} className="bg-slate-900 border-slate-700" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">{lang === "ar" ? "رابط القناة" : "Channel Link"}</Label>
                  <Input
                    name="link"
                    type="url"
                    defaultValue={editing?.link ?? ""}
                    dir="ltr"
                    placeholder="https://youtube.com/@channel"
                    className="bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-slate-300">{lang === "ar" ? "السيستم" : "System"}</Label>
                    <Select
                      value={systemId}
                      onValueChange={(val) => {
                        setSystemId(val);
                        if (val === "none") setSystemPercentage(0);
                      }}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-700">
                        <SelectValue placeholder={lang === "ar" ? "اختر السيستم" : "Select system"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{lang === "ar" ? "بدون سيستم (مباشر)" : "No system (Direct)"}</SelectItem>
                        {systems.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="new">{lang === "ar" ? "+ إضافة سيستم جديد..." : "+ Add new system..."}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {systemId === "new" && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="text-slate-300">{lang === "ar" ? "اسم السيستم الجديد *" : "New System Name *"}</Label>
                      <Input
                        required
                        placeholder={lang === "ar" ? "أدخل اسم السيستم الجديد" : "Enter new system name"}
                        value={newSystemName}
                        onChange={(e) => setNewSystemName(e.target.value)}
                        className="bg-slate-900 border-slate-700"
                      />
                    </div>
                  )}
                </div>

                <div className={`grid ${systemId !== "none" ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
                  <div className="space-y-2">
                    <Label className="text-slate-300">{lang === "ar" ? "نسبة العميل % *" : "Client % *"}</Label>
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
                      className="bg-slate-900 border-slate-700"
                    />
                  </div>

                  {systemId !== "none" && (
                    <div className="space-y-2">
                      <Label className="text-slate-300">{lang === "ar" ? "نسبة السيستم % *" : "System % *"}</Label>
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
                        className="bg-slate-900 border-slate-700"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-slate-300">{lang === "ar" ? "نسبة الشركة %" : "Company %"}</Label>
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
                    {t("monetization")}
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">{t("status")}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="bg-slate-900 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["active", "paused", "suspended", "closed"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {lang === "ar" ? STATUS_AR[s] : s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="gap-2 pt-2">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? t("loading") : t("save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("searchChannelPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input-padding"
          />
        </div>
        {isStaff && (
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-48 bg-slate-900 border-slate-700">
              <SelectValue placeholder={lang === "ar" ? "كل العملاء" : "All clients"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل العملاء" : "All clients"}</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterSystem} onValueChange={setFilterSystem}>
          <SelectTrigger className="w-44 bg-slate-900 border-slate-700">
            <SelectValue placeholder={lang === "ar" ? "كل السيستمز" : "All systems"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل السيستمز" : "All systems"}</SelectItem>
            <SelectItem value="none">{lang === "ar" ? "مباشر (بدون سيستم)" : "Direct (No system)"}</SelectItem>
            {systems.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-slate-900 border-slate-700">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</SelectItem>
            {["active", "paused", "suspended", "closed"].map((s) => (
              <SelectItem key={s} value={s}>
                {lang === "ar" ? STATUS_AR[s] : s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonetized} onValueChange={setFilterMonetized}>
          <SelectTrigger className="w-40 bg-slate-900 border-slate-700">
            <SelectValue placeholder={t("monetization")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل قنوات الأرباح" : "All monetization statuses"}</SelectItem>
            <SelectItem value="yes">{lang === "ar" ? "أرباح مفعلة" : "Monetized"}</SelectItem>
            <SelectItem value="no">{lang === "ar" ? "أرباح غير مفعلة" : "Not monetized"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-12">#</TableHead>
                <TableHead className="text-right">{t("channelName")}</TableHead>
                <TableHead className="text-right">{t("clientName")}</TableHead>
                {isAdmin && <TableHead className="text-right">{t("systemName")}</TableHead>}
                {isAdmin && <TableHead className="text-center">{t("clientPercent")}</TableHead>}
                {isAdmin && <TableHead className="text-center">{t("systemPercent")}</TableHead>}
                {isAdmin && <TableHead className="text-center">{t("companyPercent")}</TableHead>}
                <TableHead className="text-center">{t("monetization")}</TableHead>
                <TableHead className="text-right">{t("status")}</TableHead>
                <TableHead className="text-right">{t("link")}</TableHead>
                {isAdmin && <TableHead className="text-left">{t("actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 11 : 6} className="text-center">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 11 : 6} className="text-center text-muted-foreground py-8">
                    {lang === "ar" ? "لا توجد قنوات" : "No channels found"}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c, index) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold text-slate-400 text-right">{index + 1}</TableCell>
                  <TableCell className="font-medium text-right">{c.name}</TableCell>
                  <TableCell className="text-right">{c.clients?.name ?? "—"}</TableCell>
                  {isAdmin && <TableCell className="text-right text-white">{c.systems?.name ?? (lang === "ar" ? "مباشر" : "Direct")}</TableCell>}
                  {isAdmin && (
                    <TableCell dir="ltr" className="text-center text-white">
                      {c.client_percentage}%
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell dir="ltr" className="text-center text-white">
                      {c.system_id ? `${c.system_percentage}%` : "—"}
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell dir="ltr" className="text-center text-white">
                      {c.company_percentage ?? (100 - c.client_percentage - (c.system_percentage ?? 0))}%
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    {c.is_monetized !== false ? (
                      <Badge className="bg-primary text-primary-foreground font-bold rounded-full border-none px-2.5 py-0.5 hover:bg-primary">
                        {t("monetized")}
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-600 text-slate-200 rounded-full border-none px-2.5 py-0.5 hover:bg-slate-600">
                        {t("notMonetized")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-white font-medium">
                    {lang === "ar" ? STATUS_AR[c.status] : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.link ? (
                      <a
                        href={c.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-100 hover:text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {lang === "ar" ? "فتح" : "Open"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {isAdmin && (
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
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="bg-slate-900 border border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-right">{lang === "ar" ? "هل أنت متأكد تماماً من حذف هذه القناة؟" : "Are you absolutely sure you want to delete this channel?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              {lang === "ar" ? "هذا الإجراء سيقوم بحذف القناة نهائياً من النظام. سيتم الاحتفاظ بجميع السجلات المالية السابقة المرتبطة بها." : "This action will permanently delete this channel from the system. Past financial records associated with it will be preserved."}
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
              {lang === "ar" ? "نعم، احذف القناة" : "Yes, delete channel"}
            </AlertDialogAction>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">{t("cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

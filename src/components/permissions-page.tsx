import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Unlink, UserPlus, Link2, Search, Lock, ShieldAlert, Power } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  listUserPermissions,
  setUserRole,
  unlinkUserFromClient,
  toggleUserActive,
} from "@/lib/permissions.functions";
import { createAppUser, linkUserToClientById, resetClientPassword } from "@/lib/admin.functions";

const roleLabels: Record<string, string> = {
  admin: "مسؤول",
  employee: "موظف",
  client: "عميل",
};

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  employee: "secondary",
  client: "outline",
};

type ClientOption = { id: string; name: string };

export function PermissionsPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listUserPermissions);
  const setRoleFn = useServerFn(setUserRole);
  const unlinkFn = useServerFn(unlinkUserFromClient);
  const createUserFn = useServerFn(createAppUser);
  const linkUserFn = useServerFn(linkUserToClientById);
  const toggleActiveFn = useServerFn(toggleUserActive);
  const resetPasswordFn = useServerFn(resetClientPassword);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "employee" as "admin" | "employee" | "client",
    clientId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);

  // New features state
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [showNewClientInput, setShowNewClientInput] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["user-permissions"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["clients-options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data as ClientOption[];
    },
    enabled: isAdmin,
  });

  async function changeRole(userId: string, role: string) {
    try {
      await setRoleFn({ data: { userId, role } });
      toast.success("تم تحديث الصلاحيات بنجاح");
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? "فشل التحديث");
    }
  }

  async function unlink(clientId: string) {
    try {
      await unlinkFn({ data: { clientId } });
      toast.success("تم فك الربط");
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? "فشل فك الربط");
    }
  }

  async function linkToClient(userId: string, clientId: string) {
    try {
      await linkUserFn({ data: { userId, clientId } });
      toast.success("تم ربط المستخدم بالعميل");
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? "فشل الربط");
    }
  }

  async function submitCreate() {
    setSubmitting(true);
    try {
      await createUserFn({
        data: {
          email: form.email,
          password: form.password,
          fullName: form.fullName || undefined,
          role: form.role,
          clientId: form.role === "client" && !showNewClientInput ? form.clientId || null : null,
          newClientName: form.role === "client" && showNewClientInput ? newClientName : null,
        },
      });
      toast.success("تم إنشاء المستخدم بنجاح");
      setOpen(false);
      setForm({ email: "", password: "", fullName: "", role: "employee", clientId: "" });
      setNewClientName("");
      setShowNewClientInput(false);
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? "فشل إنشاء المستخدم");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(userId: string, currentStatus: boolean) {
    try {
      await toggleActiveFn({ data: { userId, isActive: !currentStatus } });
      toast.success(!currentStatus ? "تم تفعيل الحساب بنجاح" : "تم إيقاف الحساب بنجاح");
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? "فشل تعديل حالة الحساب");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetPasswordFn({ data: { userId: resetTarget.userId, password: newPassword } });
      toast.success("تم تغيير كلمة المرور بنجاح");
      setResetOpen(false);
      setNewPassword("");
      setResetTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "فشل تغيير كلمة المرور");
    } finally {
      setResetting(false);
    }
  }

  // Filtered users calculation
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((u: any) => {
      if (filterRole !== "all" && !u.roles.includes(filterRole)) return false;
      if (q) {
        const hay = `${u.fullName ?? ""} ${u.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, filterRole]);

  if (loading || !isAdmin) return null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <ShieldCheck className="w-8 h-8 text-primary" />
            الصلاحيات والمستخدمين
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            إدارة المستخدمين والأدوار والربط بالعملاء وتفعيل الحسابات
          </p>
        </div>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setNewClientName(""); setShowNewClientInput(false); } }}>
          <DialogTrigger asChild>
            <Button className="btn-header-action">
              <UserPlus className="h-4 w-4 ml-2" />
              إضافة مستخدم جديد
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>الاسم الكامل</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="اسم الشخص أو الموظف (اختياري)"
                />
              </div>
              <div>
                <Label>البريد الإلكتروني *</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="example@domain.com"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>كلمة السر المؤقتة *</Label>
                <Input
                  type="text"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="6 أحرف على الأقل"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>الدور *</Label>
                <Select
                  value={form.role}
                  onValueChange={(v: any) => {
                    setForm({ ...form, role: v });
                    if (v !== "client") {
                      setShowNewClientInput(false);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مسؤول (صلاحيات كاملة)</SelectItem>
                    <SelectItem value="employee">موظف</SelectItem>
                    <SelectItem value="client">عميل (يرى قنواته فقط)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.role === "client" && (
                <div className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-4 mb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-white">
                      <input
                        type="radio"
                        name="clientType"
                        checked={!showNewClientInput}
                        onChange={() => setShowNewClientInput(false)}
                        className="accent-primary h-4 w-4"
                      />
                      عميل مسجل حالياً
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-white">
                      <input
                        type="radio"
                        name="clientType"
                        checked={showNewClientInput}
                        onChange={() => setShowNewClientInput(true)}
                        className="accent-primary h-4 w-4"
                      />
                      إنشاء عميل جديد تلقائياً
                    </label>
                  </div>

                  {!showNewClientInput ? (
                    <div>
                      <Label>العميل المرتبط *</Label>
                      <Select
                        value={form.clientId}
                        onValueChange={(v) => setForm({ ...form, clientId: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label>اسم العميل الجديد *</Label>
                      <Input
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="اسم العميل أو الشركة لتسجيلها..."
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={submitCreate} disabled={submitting}>
                {submitting ? "جارٍ الإنشاء..." : "إنشاء المستخدم"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="بحث بالاسم أو البريد الإلكتروني…" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pr-10 search-input-padding" 
          />
        </div>
        
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="تصفية حسب الدور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأدوار</SelectItem>
            <SelectItem value="admin">مسؤولين</SelectItem>
            <SelectItem value="employee">موظفين</SelectItem>
            <SelectItem value="client">عملاء</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المستخدمين</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground text-sm">جارٍ تحميل قائمة المستخدمين والصلاحيات...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">البريد الإلكتروني</TableHead>
                    <TableHead className="text-right">الدور</TableHead>
                    <TableHead className="text-right">حالة الحساب</TableHead>
                    <TableHead className="text-right">العميل المرتبط</TableHead>
                    <TableHead className="text-right">تعديل الدور والربط</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const primaryRole = u.roles[0] ?? "client";
                    const isSelf = u.userId === user?.id;
                    return (
                      <TableRow key={u.userId} className={u.isActive ? "" : "opacity-60 bg-slate-900/10"}>
                        <TableCell className="text-right font-medium text-white">{u.fullName || "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-right" dir="ltr">{u.email}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap gap-1 justify-start">
                            {u.roles.length === 0 ? (
                              <Badge variant="outline">بدون دور</Badge>
                            ) : (
                              u.roles.map((r) => (
                                <Badge key={r} variant={roleVariants[r] ?? "outline"}>
                                  {roleLabels[r] ?? r}
                                </Badge>
                              ))
                            )}
                            {isSelf && <Badge variant="outline">أنت</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={u.isActive ? "default" : "destructive"}>
                            {u.isActive ? "نشط" : "معطل"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {u.client ? (
                            <span className="text-sm font-semibold text-white">{u.client.name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 items-center flex-wrap">
                            <Select
                              value={primaryRole}
                              onValueChange={(v) => changeRole(u.userId, v)}
                              disabled={isSelf}
                            >
                              <SelectTrigger className="w-28 h-8 text-xs bg-slate-900/50 border-slate-800">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">مسؤول</SelectItem>
                                <SelectItem value="employee">موظف</SelectItem>
                                <SelectItem value="client">عميل</SelectItem>
                              </SelectContent>
                            </Select>

                            {primaryRole === "client" && (
                              <Select
                                value={u.client?.id ?? "none"}
                                onValueChange={(v) => {
                                  if (v === "none") {
                                    if (u.client?.id) setUnlinkTarget(u.client.id);
                                  } else {
                                    linkToClient(u.userId, v);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-36 h-8 text-xs bg-slate-900/50 border-slate-800">
                                  <SelectValue placeholder="ربط بعميل" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">غير مرتبط</SelectItem>
                                  {clients.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              title={u.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                              onClick={() => toggleActive(u.userId, u.isActive)}
                              disabled={isSelf}
                              className={u.isActive ? "text-slate-400 hover:text-red-400 hover:bg-slate-800" : "text-slate-500 hover:text-green-400 hover:bg-slate-800"}
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="تغيير كلمة المرور"
                              onClick={() => {
                                setResetTarget({ userId: u.userId, email: u.email });
                                setResetOpen(true);
                              }}
                              className="text-slate-400 hover:text-primary hover:bg-slate-800"
                            >
                              <Lock className="w-4 h-4" />
                            </Button>
                            {u.client && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="فك ربط العميل"
                                onClick={() => setUnlinkTarget(u.client!.id)}
                                className="text-slate-400 hover:text-red-400 hover:bg-slate-800"
                              >
                                <Unlink className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        لا يوجد مستخدمون يطابقون خيارات البحث.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-amber-500" /> ملاحظات الأمان والتحكم</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>• فقط المسؤول (Admin) يستطيع الوصول لهذه الصفحة وإدارة صلاحيات المستخدمين والتحكم بحالة حساباتهم.</p>
          <p>• المسؤول والموظف يمتلكان صلاحيات تشغيلية لرؤية وإدارة كافة العملاء والقنوات والإيرادات.</p>
          <p>• العميل النشط يتم ربطه بملفه الشخصي لرؤية قنواته وإيراداته الفردية فقط بموجب سياسات حماية قاعدة البيانات (RLS).</p>
          <p>• إذا قمت بتعطيل حساب مستخدم، فسيتم إخراجه فوراً وسحب جميع صلاحيات قراءة أو تعديل البيانات منه على السيرفر وقاعدة البيانات.</p>
          <p>• لا يمكنك تعطيل حسابك الشخصي أو إزالة دور المسؤول عن نفسك لتجنب قفل لوحة التحكم بالخطأ.</p>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور للمستخدم</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 mt-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">تعديل كلمة مرور الحساب التالي:</span>
              <p className="text-sm font-bold text-white font-mono">{resetTarget?.email}</p>
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة *</Label>
              <Input
                type="text"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل 6 أحرف على الأقل..."
                dir="ltr"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={resetting}>
                {resetting ? "جاري التحديث..." : "تحديث كلمة المرور"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل تريد فك الربط بين هذا المستخدم والعميل؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء سيقوم بإزالة ارتباط العميل بهذا الحساب، ولن يتمكن هذا الحساب من رؤية أي قنوات أو تقارير تخص هذا العميل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinkTarget) {
                  unlink(unlinkTarget);
                  setUnlinkTarget(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              نعم، فك الربط
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

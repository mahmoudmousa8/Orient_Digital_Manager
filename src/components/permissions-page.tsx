import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Unlink, UserPlus, Link2 } from "lucide-react";
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
} from "@/lib/permissions.functions";
import { createAppUser, linkUserToClientById } from "@/lib/admin.functions";

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
      toast.success("تم تحديث الصلاحيات");
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
          clientId: form.role === "client" || form.clientId ? form.clientId || null : null,
        },
      });
      toast.success("تم إنشاء المستخدم");
      setOpen(false);
      setForm({ email: "", password: "", fullName: "", role: "employee", clientId: "" });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? "فشل إنشاء المستخدم");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <ShieldCheck className="w-8 h-8 text-primary" />
            الصلاحيات
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            إدارة المستخدمين والأدوار وربطهم بالعملاء (القنوات)
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="btn-header-action">
              <UserPlus className="h-4 w-4 ml-2" />
              إضافة مستخدم
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>الاسم الكامل</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="اختياري"
                />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>كلمة السر المؤقتة</Label>
                <Input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div>
                <Label>الدور</Label>
                <Select
                  value={form.role}
                  onValueChange={(v: any) => setForm({ ...form, role: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مسؤول (صلاحيات كاملة)</SelectItem>
                    <SelectItem value="employee">موظف</SelectItem>
                    <SelectItem value="client">عميل (يرى قنواته فقط)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(form.role === "client" || form.clientId) && (
                <div>
                  <Label>
                    {form.role === "client" ? "العميل المرتبط *" : "ربط بعميل (اختياري)"}
                  </Label>
                  <Select
                    value={form.clientId}
                    onValueChange={(v) => setForm({ ...form, clientId: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر عميل" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.role !== "client" && !form.clientId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setForm({ ...form, clientId: clients[0]?.id ?? "" })}
                  disabled={clients.length === 0}
                >
                  <Link2 className="h-4 w-4 ml-2" />
                  ربط بعميل (اختياري)
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={submitCreate} disabled={submitting}>
                {submitting ? "جارٍ الإنشاء..." : "إنشاء"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>المستخدمون</CardTitle>
        </CardHeader>
        <CardContent>
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
                    <TableHead>الاسم</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>الدور</TableHead>
                    <TableHead>العميل المرتبط</TableHead>
                    <TableHead>تغيير الدور</TableHead>
                    <TableHead>ربط بعميل</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((u) => {
                    const primaryRole = u.roles[0] ?? "client";
                    const isSelf = u.userId === user?.id;
                    return (
                      <TableRow key={u.userId}>
                        <TableCell>{u.fullName || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{u.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0 ? (
                              <Badge variant="outline">بدون</Badge>
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
                        <TableCell>
                          {u.client ? (
                            <span className="text-sm">{u.client.name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={primaryRole}
                            onValueChange={(v) => changeRole(u.userId, v)}
                            disabled={isSelf}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">مسؤول</SelectItem>
                              <SelectItem value="employee">موظف</SelectItem>
                              <SelectItem value="client">عميل</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.client?.id ?? ""}
                            onValueChange={(v) => linkToClient(u.userId, v)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="اختر عميل" />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {u.client && (
                            <Button variant="ghost" size="sm" onClick={() => setUnlinkTarget(u.client!.id)}>
                              <Unlink className="h-4 w-4 ml-1" />
                              فك الربط
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        لا يوجد مستخدمون
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
          <CardTitle className="text-base">ملاحظات الأمان</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• فقط المسؤول يستطيع الوصول لهذه الصفحة وإنشاء المستخدمين وتعديل الأدوار.</p>
          <p>• المسؤول والموظف لهما صلاحيات على كل العملاء والقنوات.</p>
          <p>• العميل يرى قنواته فقط (المرتبطة بحسابه عبر RLS).</p>
          <p>• لا يمكنك تخفيض دورك الخاص لتفادي فقدان صلاحيات الإدارة.</p>
        </CardContent>
      </Card>

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

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Unlink, UserPlus, Link2, Search, Lock, ShieldAlert, Power, Pencil, Users } from "lucide-react";
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
  unlinkUserFromClients,
  toggleUserActive,
} from "@/lib/permissions.functions";
import { createAppUser, resetClientPassword, updateAppUser } from "@/lib/admin.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/hooks/use-language";

const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  employee: "secondary",
  client: "outline",
};

type ClientOption = { id: string; name: string };

export function UsersPage() {
  const { t, lang } = useLanguage();
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const roleLabels: Record<string, string> = {
    admin: lang === "ar" ? "مسؤول" : "Admin",
    employee: lang === "ar" ? "موظف" : "Employee",
    client: lang === "ar" ? "عميل" : "Client",
  };
  
  // Server functions
  const listFn = useServerFn(listUserPermissions);
  const unlinkFn = useServerFn(unlinkUserFromClients);
  const createUserFn = useServerFn(createAppUser);
  const updateUserFn = useServerFn(updateAppUser);
  const toggleActiveFn = useServerFn(toggleUserActive);
  const resetPasswordFn = useServerFn(resetClientPassword);

  // Lists and Queries
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

  // Local UI States
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  
  // Create User State
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "employee" as "admin" | "employee" | "client",
    clientIds: [] as string[],
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createShowNewClientInput, setCreateShowNewClientInput] = useState(false);
  const [createNewClientName, setCreateNewClientName] = useState("");

  // Edit User State
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    userId: "",
    email: "",
    fullName: "",
    role: "employee" as "admin" | "employee" | "client",
    clientIds: [] as string[],
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editShowNewClientInput, setEditShowNewClientInput] = useState(false);
  const [editNewClientName, setEditNewClientName] = useState("");

  // Password Reset State
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Unlink State
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, navigate]);

  // Actions
  async function submitCreate() {
    setCreateSubmitting(true);
    try {
      await createUserFn({
        data: {
          email: createForm.email,
          password: createForm.password,
          fullName: createForm.fullName || undefined,
          role: createForm.role,
          clientIds: createForm.role === "client" && !createShowNewClientInput ? createForm.clientIds : [],
          newClientName: createForm.role === "client" && createShowNewClientInput ? createNewClientName : null,
        },
      });
      toast.success(lang === "ar" ? "تم إنشاء المستخدم بنجاح" : "User created successfully");
      setCreateOpen(false);
      setCreateForm({ email: "", password: "", fullName: "", role: "employee", clientIds: [] });
      setCreateNewClientName("");
      setCreateShowNewClientInput(false);
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? (lang === "ar" ? "فشل إنشاء المستخدم" : "Failed to create user"));
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function openEdit(u: any) {
    const primaryRole = u.roles[0] ?? "client";
    setEditForm({
      userId: u.userId,
      email: u.email,
      fullName: u.fullName || "",
      role: primaryRole,
      clientIds: (u.clients ?? []).map((c: any) => c.id),
    });
    setEditNewClientName("");
    setEditShowNewClientInput(false);
    setEditOpen(true);
  }

  async function submitEdit() {
    setEditSubmitting(true);
    try {
      await updateUserFn({
        data: {
          userId: editForm.userId,
          email: editForm.email,
          fullName: editForm.fullName,
          role: editForm.role,
          clientIds: editForm.role === "client" && !editShowNewClientInput ? editForm.clientIds : [],
          newClientName: editForm.role === "client" && editShowNewClientInput ? editNewClientName : null,
        },
      });
      toast.success(lang === "ar" ? "تم تحديث بيانات المستخدم بنجاح" : "User details updated successfully");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? (lang === "ar" ? "فشل تحديث البيانات" : "Failed to update user details"));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleActive(userId: string, currentStatus: boolean) {
    try {
      await toggleActiveFn({ data: { userId, isActive: !currentStatus } });
      toast.success(!currentStatus 
        ? (lang === "ar" ? "تم تفعيل الحساب بنجاح" : "Account activated successfully") 
        : (lang === "ar" ? "تم إيقاف الحساب بنجاح" : "Account deactivated successfully"));
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? (lang === "ar" ? "فشل تعديل حالة الحساب" : "Failed to modify account status"));
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetPasswordFn({ data: { userId: resetTarget.userId, password: newPassword } });
      toast.success(lang === "ar" ? "تم تغيير كلمة المرور بنجاح" : "Password changed successfully");
      setResetOpen(false);
      setNewPassword("");
      setResetTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? (lang === "ar" ? "فشل تغيير كلمة المرور" : "Failed to change password"));
    } finally {
      setResetting(false);
    }
  }

  async function unlink(userId: string) {
    try {
      await unlinkFn({ data: { userId } });
      toast.success(lang === "ar" ? "تم فك ارتباط العملاء بنجاح" : "Successfully unlinked clients");
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    } catch (e: any) {
      toast.error(e.message ?? (lang === "ar" ? "فشل فك الارتباط" : "Failed to unlink"));
    }
  }

  // Filtered list
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
            <Users className="w-8 h-8 text-primary" />
            {lang === "ar" ? "المستخدمون" : "Users"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {lang === "ar" 
              ? "إدارة حسابات المسؤولين، الموظفين، والعملاء وتعديل الصلاحيات وتفعيل الدخول" 
              : "Manage admin, employee, and client accounts, modify permissions and toggle access"}
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) { setCreateNewClientName(""); setCreateShowNewClientInput(false); } }}>
          <DialogTrigger asChild>
            <Button className="btn-header-action bg-primary text-white hover:bg-primary/95">
              <UserPlus className="h-4 w-4 ml-2" />
              {lang === "ar" ? "إضافة مستخدم جديد" : "Add New User"}
            </Button>
          </DialogTrigger>
          <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="text-right">
            <DialogHeader>
              <DialogTitle className={lang === "en" ? "text-left text-white font-bold" : "text-white font-bold"}>
                {lang === "ar" ? "إنشاء حساب مستخدم جديد" : "Create New User Account"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 text-right">
              <div>
                <Label className="text-slate-300">{lang === "ar" ? "الاسم الكامل" : "Full Name"}</Label>
                <Input
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  placeholder={lang === "ar" ? "اسم الشخص أو الموظف (اختياري)" : "Person or employee name (optional)"}
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">{lang === "ar" ? "البريد الإلكتروني *" : "Email Address *"}</Label>
                <Input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="example@domain.com"
                  dir="ltr"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">{lang === "ar" ? "كلمة السر المؤقتة *" : "Temporary Password *"}</Label>
                <Input
                  type="text"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder={lang === "ar" ? "6 أحرف على الأقل" : "At least 6 characters"}
                  dir="ltr"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">{lang === "ar" ? "الدور *" : "Role *"}</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v: any) => {
                    setCreateForm({ ...createForm, role: v });
                    if (v !== "client") {
                      setCreateShowNewClientInput(false);
                    }
                  }}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{lang === "ar" ? "مسؤول (صلاحيات كاملة)" : "Admin (Full Access)"}</SelectItem>
                    <SelectItem value="employee">{lang === "ar" ? "موظف" : "Employee"}</SelectItem>
                    <SelectItem value="client">{lang === "ar" ? "عميل (يرى قنواته فقط)" : "Client (View own channels only)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createForm.role === "client" && (
                <div className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-4 mb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-white">
                      <input
                        type="radio"
                        name="createClientType"
                        checked={!createShowNewClientInput}
                        onChange={() => setCreateShowNewClientInput(false)}
                        className="accent-primary h-4 w-4"
                      />
                      {lang === "ar" ? "عميل مسجل حالياً" : "Currently Registered Client"}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-white">
                      <input
                        type="radio"
                        name="createClientType"
                        checked={createShowNewClientInput}
                        onChange={() => setCreateShowNewClientInput(true)}
                        className="accent-primary h-4 w-4"
                      />
                      {lang === "ar" ? "إنشاء عميل جديد تلقائياً" : "Auto-create New Client"}
                    </label>
                  </div>

                  {!createShowNewClientInput ? (
                    <div>
                      <Label className="text-white mb-2 block">{lang === "ar" ? "العملاء المرتبطين *" : "Linked Clients *"}</Label>
                      <div className="h-44 overflow-y-auto border border-slate-800 bg-slate-950 rounded-md p-2.5 space-y-2">
                        {clients.map((c) => {
                          const isChecked = createForm.clientIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-white cursor-pointer select-none">
                              <Checkbox
                                id={`create-client-${c.id}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const newIds = checked
                                    ? [...createForm.clientIds, c.id]
                                    : createForm.clientIds.filter((id) => id !== c.id);
                                  setCreateForm({ ...createForm, clientIds: newIds });
                                }}
                              />
                              <span>{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-slate-300">{lang === "ar" ? "اسم العميل الجديد *" : "New Client Name *"}</Label>
                      <Input
                        value={createNewClientName}
                        onChange={(e) => setCreateNewClientName(e.target.value)}
                        placeholder={lang === "ar" ? "اسم العميل أو الشركة لتسجيلها..." : "Name of the client or company to register..."}
                        className="bg-slate-900 border-slate-700 text-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800">{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={submitCreate} disabled={createSubmitting}>
                {createSubmitting ? (lang === "ar" ? "جارٍ الإنشاء..." : "Creating...") : (lang === "ar" ? "إنشاء الحساب" : "Create Account")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder={lang === "ar" ? "بحث بالاسم أو البريد الإلكتروني…" : "Search by name or email..."} 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pr-10 search-input-padding bg-slate-900 border-slate-800 text-white" 
          />
        </div>
        
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-44 bg-slate-900 border-slate-800 text-white">
            <SelectValue placeholder={lang === "ar" ? "تصفية حسب الدور" : "Filter by Role"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الأدوار" : "All Roles"}</SelectItem>
            <SelectItem value="admin">{lang === "ar" ? "مسؤولين" : "Admins"}</SelectItem>
            <SelectItem value="employee">{lang === "ar" ? "موظفين" : "Employees"}</SelectItem>
            <SelectItem value="client">{lang === "ar" ? "عملاء" : "Clients"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-right font-bold">{lang === "ar" ? "قائمة الحسابات" : "Account List"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground text-sm">{lang === "ar" ? "جارٍ تحميل قائمة المستخدمين والصلاحيات..." : "Loading user list and permissions..."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === "ar" ? "الاسم الكامل" : "Full Name"}</TableHead>
                    <TableHead className="text-right">{lang === "ar" ? "البريد الإلكتروني" : "Email Address"}</TableHead>
                    <TableHead className="text-right">{lang === "ar" ? "الدور" : "Role"}</TableHead>
                    <TableHead className="text-right">{lang === "ar" ? "حالة الحساب" : "Account Status"}</TableHead>
                    <TableHead className="text-right">{lang === "ar" ? "العميل المرتبط" : "Linked Client"}</TableHead>
                    <TableHead className={lang === "ar" ? "text-left" : "text-right"}>{lang === "ar" ? "إجراءات التحكم" : "Actions"}</TableHead>
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
                              <Badge variant="outline">{lang === "ar" ? "بدون دور" : "No Role"}</Badge>
                            ) : (
                              u.roles.map((r) => (
                                <Badge key={r} variant={roleVariants[r] ?? "outline"}>
                                  {roleLabels[r] ?? r}
                                </Badge>
                              ))
                            )}
                            {isSelf && <Badge variant="outline" className="bg-slate-800 text-slate-300">{lang === "ar" ? "أنت" : "You"}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={u.isActive ? "default" : "destructive"}>
                            {u.isActive ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "معطل" : "Disabled")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {u.clients && u.clients.length > 0 ? (
                            <span className="text-sm font-semibold text-white">
                              {u.clients.map((c: any) => c.name).join(lang === "ar" ? "، " : ", ")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={lang === "ar" ? "text-left" : "text-right"}>
                          <div className={`flex gap-1 ${lang === "ar" ? "justify-end" : "justify-start"}`}>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={lang === "ar" ? "تعديل بيانات الحساب" : "Edit Account Details"}
                              onClick={() => openEdit(u)}
                              className="text-slate-400 hover:text-primary hover:bg-slate-800"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={u.isActive 
                                ? (lang === "ar" ? "تعطيل الحساب" : "Disable Account") 
                                : (lang === "ar" ? "تفعيل الحساب" : "Enable Account")}
                              onClick={() => toggleActive(u.userId, u.isActive)}
                              disabled={isSelf}
                              className={u.isActive ? "text-slate-400 hover:text-red-400 hover:bg-slate-800" : "text-slate-500 hover:text-green-400 hover:bg-slate-800"}
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={lang === "ar" ? "تغيير كلمة المرور" : "Change Password"}
                              onClick={() => {
                                setResetTarget({ userId: u.userId, email: u.email });
                                setResetOpen(true);
                              }}
                              className="text-slate-400 hover:text-primary hover:bg-slate-800"
                            >
                              <Lock className="w-4 h-4" />
                            </Button>
                            {u.clients && u.clients.length > 0 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title={lang === "ar" ? "فك ربط العملاء" : "Unlink Clients"}
                                onClick={() => setUnlinkTarget(u.userId)}
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
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {lang === "ar" ? "لا يوجد مستخدمون يطابقون خيارات البحث." : "No users match the search criteria."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-slate-800 bg-slate-950/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-white font-bold">
            <ShieldAlert className="w-5 h-5 text-amber-500" /> 
            {lang === "ar" ? "ملاحظات الأمان والتحكم" : "Security & Control Notes"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5 text-right">
          <p>
            {lang === "ar" 
              ? "• فقط المسؤول (Admin) يستطيع الوصول لهذه الصفحة وإدارة صلاحيات المستخدمين والتحكم بحالة حساباتهم." 
              : "• Only Admins can access this page to manage user permissions and access status."}
          </p>
          <p>
            {lang === "ar" 
              ? "• المسؤول والموظف يمتلكان صلاحيات تشغيلية لرؤية وإدارة كافة العملاء والقنوات والإيرادات." 
              : "• Admins and Employees have operational permissions to view and manage all clients, channels, and revenues."}
          </p>
          <p>
            {lang === "ar" 
              ? "• العميل النشط يتم ربطه بملفه الشخصي لرؤية قنواته وإيراداته الفردية فقط بموجب سياسات حماية قاعدة البيانات (RLS)." 
              : "• Active Clients are linked to their profiles to view only their individual channels and revenues via Row Level Security (RLS) policies."}
          </p>
          <p>
            {lang === "ar" 
              ? "• إذا قمت بتعطيل حساب مستخدم، فسيتم إخراجه فوراً وسحب جميع صلاحيات قراءة أو تعديل البيانات منه على السيرفر وقاعدة البيانات." 
              : "• Disabling a user account signs them out immediately and revokes all read/write permissions on the server and database."}
          </p>
          <p>
            {lang === "ar" 
              ? "• لا يمكنك تعطيل حسابك الشخصي أو إزالة دور المسؤول عن نفسك لتجنب قفل لوحة التحكم بالخطأ." 
              : "• You cannot disable your own account or remove your admin role to prevent accidentally locking yourself out of the dashboard."}
          </p>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditNewClientName(""); setEditShowNewClientInput(false); } }}>
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="text-right">
          <DialogHeader>
            <DialogTitle className={lang === "en" ? "text-left text-white font-bold" : "text-white font-bold"}>
              {lang === "ar" ? "تعديل بيانات حساب المستخدم" : "Edit User Account Details"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-right">
            <div>
              <Label className="text-slate-300">{lang === "ar" ? "الاسم الكامل" : "Full Name"}</Label>
              <Input
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                placeholder={lang === "ar" ? "اسم الشخص أو الموظف" : "Person or employee name"}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">{lang === "ar" ? "البريد الإلكتروني *" : "Email Address *"}</Label>
              <Input
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="example@domain.com"
                dir="ltr"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">{lang === "ar" ? "الدور *" : "Role *"}</Label>
              <Select
                value={editForm.role}
                onValueChange={(v: any) => {
                  setEditForm({ ...editForm, role: v });
                  if (v !== "client") {
                    setEditShowNewClientInput(false);
                  }
                }}
                disabled={editForm.userId === user?.id} // Prevent changing own role
              >
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{lang === "ar" ? "مسؤول (صلاحيات كاملة)" : "Admin (Full Access)"}</SelectItem>
                  <SelectItem value="employee">{lang === "ar" ? "موظف" : "Employee"}</SelectItem>
                  <SelectItem value="client">{lang === "ar" ? "عميل (يرى قنواته فقط)" : "Client (View own channels only)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editForm.role === "client" && (
              <div className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                <div className="flex items-center gap-4 mb-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-white">
                    <input
                      type="radio"
                      name="editClientType"
                      checked={!editShowNewClientInput}
                      onChange={() => setEditShowNewClientInput(false)}
                      className="accent-primary h-4 w-4"
                    />
                    {lang === "ar" ? "عميل مسجل حالياً" : "Currently Registered Client"}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-white">
                    <input
                      type="radio"
                      name="editClientType"
                      checked={editShowNewClientInput}
                      onChange={() => setEditShowNewClientInput(true)}
                      className="accent-primary h-4 w-4"
                    />
                    {lang === "ar" ? "إنشاء عميل جديد تلقائياً" : "Auto-create New Client"}
                  </label>
                </div>

                {!editShowNewClientInput ? (
                  <div>
                    <Label className="text-white mb-2 block">{lang === "ar" ? "العملاء المرتبطين *" : "Linked Clients *"}</Label>
                    <div className="h-44 overflow-y-auto border border-slate-800 bg-slate-950 rounded-md p-2.5 space-y-2">
                      {clients.map((c) => {
                        const isChecked = editForm.clientIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2.5 text-sm text-slate-300 hover:text-white cursor-pointer select-none">
                            <Checkbox
                              id={`edit-client-${c.id}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const newIds = checked
                                  ? [...editForm.clientIds, c.id]
                                  : editForm.clientIds.filter((id) => id !== c.id);
                                setEditForm({ ...editForm, clientIds: newIds });
                              }}
                            />
                            <span>{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-slate-300">{lang === "ar" ? "اسم العميل الجديد *" : "New Client Name *"}</Label>
                    <Input
                      value={editNewClientName}
                      onChange={(e) => setEditNewClientName(e.target.value)}
                      placeholder={lang === "ar" ? "اسم العميل أو الشركة لتسجيلها..." : "Name of the client or company to register..."}
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800">{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={submitEdit} disabled={editSubmitting}>
              {editSubmitting ? (lang === "ar" ? "جاري التحديث..." : "Updating...") : (lang === "ar" ? "حفظ التغييرات" : "Save Changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="text-right">
          <DialogHeader>
            <DialogTitle className={lang === "en" ? "text-left text-white font-bold" : "text-white font-bold"}>
              {lang === "ar" ? "تغيير كلمة المرور للمستخدم" : "Change User Password"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 mt-2 text-right">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{lang === "ar" ? "تعديل كلمة مرور الحساب التالي:" : "Modify password for the following account:"}</span>
              <p className="text-sm font-bold text-white font-mono">{resetTarget?.email}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">{lang === "ar" ? "كلمة المرور الجديدة *" : "New Password *"}</Label>
              <Input
                type="text"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={lang === "ar" ? "أدخل 6 أحرف على الأقل..." : "Enter at least 6 characters..."}
                dir="ltr"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)} className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800">{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
              <Button type="submit" disabled={resetting}>
                {resetting ? (lang === "ar" ? "جاري التحديث..." : "Updating...") : (lang === "ar" ? "تحديث كلمة المرور" : "Update Password")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unlink AlertDialog */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"} className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle className={lang === "en" ? "text-left text-white font-bold font-black" : "text-white font-bold font-black"}>
              {lang === "ar" ? "هل تريد فك ربط كافة العملاء عن هذا المستخدم؟" : "Do you want to unlink all clients from this user?"}
            </AlertDialogTitle>
            <AlertDialogDescription className={lang === "en" ? "text-left" : "text-right"}>
              {lang === "ar" 
                ? "هذا الإجراء سيقوم بإزالة ارتباط كافة العملاء بهذا الحساب، ولن يتمكن هذا الحساب من رؤية أي قنوات أو تقارير تخص هؤلاء العملاء." 
                : "This action will remove all client links from this account. This user will no longer be able to see any channels or reports for these clients."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800">{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinkTarget) {
                  unlink(unlinkTarget);
                  setUnlinkTarget(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {lang === "ar" ? "نعم، فك الربط" : "Yes, Unlink"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

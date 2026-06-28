import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createClientUser, linkClientToUser, resetClientPassword } from "@/lib/admin.functions";
import { UserPlus, KeyRound, Link as LinkIcon, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  ssr: false,
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClientUser);
  const linkFn = useServerFn(linkClientToUser);
  const resetFn = useServerFn(resetClientPassword);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data: clients } = useQuery({
    queryKey: ["clients-with-user"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, email, user_id").order("name");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, email, full_name");
      return data ?? [];
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", clientId: "" });
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createFn({ data: form });
      toast.success("تم إنشاء حساب العميل");
      setCreateOpen(false);
      setForm({ email: "", password: "", fullName: "", clientId: "" });
      qc.invalidateQueries({ queryKey: ["clients-with-user"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      toast.error(err.message ?? "فشل الإنشاء");
    } finally {
      setBusy(false);
    }
  }

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ clientId: "", email: "" });

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await linkFn({ data: linkForm });
      toast.success("تم ربط المستخدم بالعميل");
      setLinkOpen(false);
      setLinkForm({ clientId: "", email: "" });
      qc.invalidateQueries({ queryKey: ["clients-with-user"] });
    } catch (err: any) {
      toast.error(err.message ?? "فشل الربط");
    } finally {
      setBusy(false);
    }
  }

  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setBusy(true);
    try {
      await resetFn({ data: { userId: resetTarget.userId, password: newPassword } });
      toast.success("تم تحديث كلمة السر");
      setResetOpen(false);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message ?? "فشل التحديث");
    } finally {
      setBusy(false);
    }
  }

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Users className="w-8 h-8 text-primary" />
            المستخدمون
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">إنشاء وإدارة حسابات العملاء</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="btn-header-action"><LinkIcon className="w-4 h-4 ml-2" />ربط حساب موجود</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>ربط مستخدم بعميل</DialogTitle></DialogHeader>
              <form onSubmit={handleLink} className="space-y-4">
                <div className="space-y-2">
                  <Label>العميل</Label>
                  <Select value={linkForm.clientId} onValueChange={(v) => setLinkForm({ ...linkForm, clientId: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                    <SelectContent>{(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>بريد المستخدم</Label>
                  <Input type="email" required dir="ltr" value={linkForm.email} onChange={(e) => setLinkForm({ ...linkForm, email: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "..." : "ربط"}</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-header-action"><UserPlus className="w-4 h-4 ml-2" />إنشاء حساب عميل</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>حساب عميل جديد</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>العميل</Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                    <SelectContent>
                      {(clients ?? []).filter((c) => !c.user_id).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الاسم الكامل (اختياري)</Label>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input type="email" required dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>كلمة سر مؤقتة</Label>
                  <Input type="text" required minLength={6} dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  <p className="text-xs text-muted-foreground">يمكن للعميل تغييرها لاحقاً من "هل نسيت كلمة السر؟"</p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "..." : "إنشاء الحساب"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>العملاء وحساباتهم</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">بريد العميل</TableHead>
                <TableHead className="text-right">الحساب المرتبط</TableHead>
                <TableHead className="text-left">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(clients ?? []).map((c) => {
                const p = c.user_id ? profilesById.get(c.user_id) : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-right">{c.name}</TableCell>
                    <TableCell dir="ltr" className="text-sm text-right text-white">{c.email ?? "—"}</TableCell>
                    <TableCell dir="ltr" className="text-sm text-right">
                      {c.user_id ? (
                        <span className="text-white">{p?.email ?? c.user_id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-muted-foreground">لا يوجد</span>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      {c.user_id && (
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setResetTarget({ userId: c.user_id!, email: p?.email ?? c.email ?? "" }); setResetOpen(true); }}>
                            <KeyRound className="w-3.5 h-3.5 ml-2" />
                            تغيير كلمة السر
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(clients ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا يوجد عملاء</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعيين كلمة سر جديدة</DialogTitle></DialogHeader>
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-muted-foreground" dir="ltr">{resetTarget?.email}</p>
            <div className="space-y-2">
              <Label>كلمة السر الجديدة</Label>
              <Input type="text" required minLength={6} dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "..." : "تحديث"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

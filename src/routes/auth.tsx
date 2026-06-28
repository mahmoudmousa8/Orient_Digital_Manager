import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Brand } from "@/components/brand";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم تسجيل الدخول");
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الحساب! يمكنك الآن تسجيل الدخول");
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إرسال رابط إعادة التعيين إلى بريدك");
    setResetOpen(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-accent">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Brand size="lg" showText={false} className="mb-3" />
          <h1 className="text-2xl font-bold">Orient Digital</h1>
          <p className="text-sm text-muted-foreground mt-1">نظام إدارة قنوات اليوتيوب</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>مرحباً بك</CardTitle>
            <CardDescription>سجّل دخولك أو أنشئ حساباً جديداً</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
                <TabsTrigger value="signup">حساب جديد</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw">كلمة المرور</Label>
                    <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "تسجيل الدخول"}</Button>
                  <button type="button" onClick={() => { setResetEmail(email); setResetOpen(true); }} className="text-xs text-primary hover:underline w-full text-center">
                    هل نسيت كلمة السر؟
                  </button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم الكامل</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">البريد الإلكتروني</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw2">كلمة المرور</Label>
                    <Input id="pw2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "إنشاء الحساب"}</Button>
                  <p className="text-xs text-muted-foreground text-center leading-relaxed">
                    الحسابات الجديدة تُسجَّل كعملاء افتراضياً
                    <br />
                    أدوار الموظفين/المسؤولين تُمنح من قاعدة البيانات
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين.</DialogDescription>
          </DialogHeader>
          <form onSubmit={sendReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">البريد الإلكتروني</Label>
              <Input id="resetEmail" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} dir="ltr" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "إرسال الرابط"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

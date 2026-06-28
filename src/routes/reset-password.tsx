import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Youtube } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return toast.error("كلمتا المرور غير متطابقتين");
    if (password.length < 6) return toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث كلمة المرور");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-accent">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary text-primary-foreground w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <Youtube className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Orient Digital</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>كلمة مرور جديدة</CardTitle>
            <CardDescription>
              {ready ? "أدخل كلمة المرور الجديدة" : "جاري التحقق من الرابط..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">كلمة المرور الجديدة</Label>
                <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpw">تأكيد كلمة المرور</Label>
                <Input id="cpw" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? "..." : "تحديث كلمة المرور"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

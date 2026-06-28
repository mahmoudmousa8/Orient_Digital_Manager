import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Save, Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name);
      setLogoUrl(settings.logo_url ?? null);
    }
  }, [settings]);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, navigate]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error("حجم الصورة كبير. الحد الأقصى 500 كيلوبايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({
      company_name: companyName,
      logo_url: logoUrl,
    }).eq("id", true);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in-up">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
          <SettingsIcon className="w-8 h-8 text-primary" />
          الإعدادات
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">شعار الشركة والمعلومات الأساسية للمنصة</p>
      </div>

      <Card>
        <CardHeader><CardTitle>هوية الشركة</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>اسم الشركة</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>الشعار</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-muted border flex items-center justify-center overflow-hidden">
                {logoUrl ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" /> : <span className="text-xs text-muted-foreground">لا يوجد</span>}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4 ml-2" />
                  رفع شعار جديد
                </Button>
                {logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>إزالة</Button>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">يفضل صورة مربعة بصيغة PNG/JPG. الحد الأقصى 500 كيلوبايت.</p>
          </div>

          <Button onClick={save} disabled={busy}>
            <Save className="w-4 h-4 ml-2" />
            {busy ? "جاري الحفظ..." : "حفظ التغييرات"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

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
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang } = useLanguage();
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
      toast.error(lang === "ar" ? "حجم الصورة كبير. الحد الأقصى 500 كيلوبايت" : "Image size is too large. Maximum size is 500KB");
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
    toast.success(lang === "ar" ? "تم حفظ الإعدادات" : "Settings saved successfully");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in-up">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
          <SettingsIcon className="w-8 h-8 text-primary" />
          {lang === "ar" ? "الإعدادات" : "Settings"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {lang === "ar" ? "شعار الشركة والمعلومات الأساسية للمنصة" : "Company logo and basic platform configuration"}
        </p>
      </div>

      <Card className="border border-slate-800">
        <CardHeader><CardTitle className="text-white text-right font-bold">{lang === "ar" ? "هوية الشركة" : "Company Identity"}</CardTitle></CardHeader>
        <CardContent className="space-y-5 text-right">
          <div className="space-y-2">
            <Label className="text-slate-300">{lang === "ar" ? "اسم الشركة" : "Company Name"}</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-slate-900 border-slate-700 text-white" />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">{lang === "ar" ? "الشعار" : "Logo"}</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden">
                {logoUrl ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" /> : <span className="text-xs text-muted-foreground">{lang === "ar" ? "لا يوجد" : "None"}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800">
                  <Upload className="w-4 h-4 ml-2" />
                  {lang === "ar" ? "رفع شعار جديد" : "Upload New Logo"}
                </Button>
                {logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)} className="text-slate-400 hover:text-white">{lang === "ar" ? "إزالة" : "Remove"}</Button>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "يفضل صورة مربعة بصيغة PNG/JPG. الحد الأقصى 500 كيلوبايت." : "Preferred format: square PNG/JPG image. Max size 500KB."}</p>
          </div>

          <Button onClick={save} disabled={busy}>
            <Save className="w-4 h-4 ml-2" />
            {busy ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : (lang === "ar" ? "حفظ التغييرات" : "Save Changes")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useSettings } from "@/hooks/use-settings";
import { Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ size = "md", showText = true, className }: { size?: "sm" | "md" | "lg"; showText?: boolean; className?: string }) {
  const { data } = useSettings();
  const dims = size === "sm" ? "w-9 h-9" : size === "lg" ? "w-14 h-14" : "w-11 h-11";
  const icon = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-7 h-7" : "w-5 h-5";
  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <div className={cn("bg-white border text-primary rounded-xl flex items-center justify-center overflow-hidden shadow-sm shrink-0", dims)}>
        {data?.logo_url ? (
          <img src={data.logo_url} alt={data.company_name} className="w-full h-full object-contain p-1" />
        ) : (
          <Youtube className={icon} />
        )}
      </div>
      {showText && (
        <div className="flex flex-col justify-center min-w-0">
          <div className={cn("font-black leading-tight text-white text-[15px] sm:text-base truncate")}>
            {data?.company_name ?? "Orient Digital"}
          </div>
          <div className={cn("text-muted-foreground font-semibold mt-0.5 text-[11px] truncate")}>
            إدارة قنوات اليوتيوب
          </div>
        </div>
      )}
    </div>
  );
}

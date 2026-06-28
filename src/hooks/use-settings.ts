import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("company_name, logo_url").eq("id", true).maybeSingle();
      return data ?? { company_name: "Orient Digital", logo_url: null as string | null };
    },
    staleTime: 60_000,
  });
}

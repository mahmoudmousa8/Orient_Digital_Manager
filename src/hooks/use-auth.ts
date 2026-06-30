import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AppRole = "admin" | "employee" | "client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadRoles(data.session.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadRoles(uid: string) {
    try {
      const [{ data: rolesData }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("is_active").eq("id", uid).maybeSingle()
      ]);

      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        toast.error("هذا الحساب معطل. يرجى التواصل مع الإدارة.");
        setRoles([]);
        setLoading(false);
        return;
      }

      setRoles((rolesData ?? []).map((r: any) => r.role));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const isAdmin = roles.includes("admin");
  const isStaff = roles.includes("admin") || roles.includes("employee");
  const isClient = roles.includes("client") && !isStaff;

  return { session, user, roles, loading, isAdmin, isStaff, isClient };
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "admin" | "employee" | "client";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("صلاحيات غير كافية");
}

export const listUserPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roles }, { data: clients }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, is_active"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("clients").select("id, name, user_id"),
    ]);

    const rolesByUser = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });

    const clientsByUser = new Map<string, { id: string; name: string }[]>();
    (clients ?? []).forEach((c: any) => {
      if (c.user_id) {
        const arr = clientsByUser.get(c.user_id) ?? [];
        arr.push({ id: c.id, name: c.name });
        clientsByUser.set(c.user_id, arr);
      }
    });

    return (profiles ?? []).map((p: any) => ({
      userId: p.id,
      email: p.email,
      fullName: p.full_name,
      isActive: p.is_active !== false,
      roles: rolesByUser.get(p.id) ?? [],
      clients: clientsByUser.get(p.id) ?? [],
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const role = String(input?.role);
    if (!["admin", "employee", "client"].includes(role)) throw new Error("دور غير صالح");
    if (!input?.userId) throw new Error("المستخدم مطلوب");
    return { userId: String(input.userId), role: role as AppRole };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("لا يمكنك إزالة صلاحيات المسؤول عن نفسك");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Replace roles: delete all then insert the chosen one
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    // If switched away from client, unlink any client record
    if (data.role !== "client") {
      await supabaseAdmin.from("clients").update({ user_id: null }).eq("user_id", data.userId);
    }
    return { ok: true };
  });

export const unlinkUserFromClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.userId) throw new Error("المستخدم مطلوب");
    return { userId: String(input.userId) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ user_id: null })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.userId) throw new Error("المستخدم مطلوب");
    return {
      userId: String(input.userId),
      isActive: Boolean(input.isActive),
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("لا يمكنك إلغاء تفعيل حسابك الخاص");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CreateClientUserInput = {
  email: string;
  password: string;
  clientId: string;
  fullName?: string;
};

function validate(input: any): CreateClientUserInput {
  if (!input || typeof input !== "object") throw new Error("Invalid input");
  const { email, password, clientId, fullName } = input;
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("بريد إلكتروني غير صالح");
  if (typeof password !== "string" || password.length < 6) throw new Error("كلمة السر يجب 6 أحرف على الأقل");
  if (typeof clientId !== "string" || clientId.length < 10) throw new Error("العميل مطلوب");
  return { email: email.trim().toLowerCase(), password, clientId, fullName: typeof fullName === "string" ? fullName : undefined };
}

export const createClientUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("صلاحيات غير كافية");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create the user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? data.email },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "فشل إنشاء المستخدم");

    const newUserId = created.user.id;

    // Ensure profile + role (the handle_new_user trigger inserts client role by default)
    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      email: data.email,
      full_name: data.fullName ?? data.email,
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: newUserId, role: "client" }, { onConflict: "user_id,role" });

    // Link to the client record (clear any other client linked to this user first)
    const { error: linkErr } = await supabaseAdmin
      .from("clients")
      .update({ user_id: newUserId })
      .eq("id", data.clientId);
    if (linkErr) throw new Error(linkErr.message);

    return { userId: newUserId };
  });

export const linkClientToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.clientId || !input?.email) throw new Error("بيانات ناقصة");
    return { clientId: String(input.clientId), email: String(input.email).toLowerCase().trim() };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("صلاحيات غير كافية");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Find user by email
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email);
    if (!user) throw new Error("لا يوجد مستخدم بهذا البريد");

    await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: "client" }, { onConflict: "user_id,role" });
    const { error: linkErr } = await supabaseAdmin.from("clients").update({ user_id: user.id }).eq("id", data.clientId);
    if (linkErr) throw new Error(linkErr.message);
    return { userId: user.id };
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    const password = String(input?.password ?? "");
    const role = String(input?.role ?? "");
    const fullName = typeof input?.fullName === "string" ? input.fullName : undefined;
    const clientId = typeof input?.clientId === "string" && input.clientId ? input.clientId : null;
    const newClientName = typeof input?.newClientName === "string" && input.newClientName ? input.newClientName.trim() : null;
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("بريد إلكتروني غير صالح");
    if (password.length < 6) throw new Error("كلمة السر يجب 6 أحرف على الأقل");
    if (!["admin", "employee", "client"].includes(role)) throw new Error("دور غير صالح");
    if (role === "client" && !clientId && !newClientName) {
      throw new Error("اختر العميل المرتبط أو أدخل اسم عميل جديد");
    }
    return { email, password, role: role as "admin" | "employee" | "client", fullName, clientId, newClientName };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("صلاحيات غير كافية");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? data.email },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "فشل إنشاء المستخدم");
    const newUserId = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      email: data.email,
      full_name: data.fullName ?? data.email,
    });
    // Replace default role from trigger with chosen role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    if (data.role === "client" && data.newClientName) {
      const { data: newClient, error: clientErr } = await supabaseAdmin
        .from("clients")
        .insert({
          name: data.newClientName,
          email: data.email,
          user_id: newUserId,
        })
        .select("id")
        .single();
      if (clientErr || !newClient) throw new Error(clientErr?.message ?? "فشل إنشاء ملف العميل");
    } else if (data.clientId) {
      await supabaseAdmin.from("clients").update({ user_id: null }).eq("user_id", newUserId);
      const { error: linkErr } = await supabaseAdmin
        .from("clients")
        .update({ user_id: newUserId })
        .eq("id", data.clientId);
      if (linkErr) throw new Error(linkErr.message);
    }
    return { userId: newUserId };
  });

export const linkUserToClientById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.userId || !input?.clientId) throw new Error("بيانات ناقصة");
    return { userId: String(input.userId), clientId: String(input.clientId) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("صلاحيات غير كافية");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Clear any other client previously linked to this user (1 user → 1 client)
    await supabaseAdmin.from("clients").update({ user_id: null }).eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ user_id: data.userId })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.userId || !input?.password) throw new Error("بيانات ناقصة");
    if (String(input.password).length < 6) throw new Error("كلمة السر قصيرة جداً");
    return { userId: String(input.userId), password: String(input.password) };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("صلاحيات غير كافية");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

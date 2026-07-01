import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: any) {
  const { data: isStaff } = await context.supabase.rpc("is_staff", {
    _user_id: context.userId,
  });
  if (!isStaff) throw new Error("صلاحيات غير كافية");
}

export const listPublishingTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch all channels, publishing trackers, and staff members
    const [{ data: channels }, { data: trackers }, { data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("channels")
        .select("id, name, status, link, is_monetized, clients(name)")
        .order("name"),
      supabaseAdmin
        .from("channel_publishing_tracker")
        .select("*")
        .eq("year", 2026),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email"),
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role"),
    ]);

    const staffIds = new Set((roles ?? [])
      .filter((r) => r.role === "admin" || r.role === "employee")
      .map((r) => r.user_id));

    const staffList = (profiles ?? []).filter((p) => staffIds.has(p.id)).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
    }));

    const trackerByChannelId = new Map<string, any>();
    (trackers ?? []).forEach((t) => {
      trackerByChannelId.set(t.channel_id, t);
    });

    const tasks = (channels ?? []).map((ch: any) => {
      const track = trackerByChannelId.get(ch.id) ?? {
        assigned_to: null,
        month_7: false,
        month_8: false,
        month_9: false,
        month_10: false,
        month_11: false,
        month_12: false,
        notes: "",
      };

      return {
        channelId: ch.id,
        channelName: ch.name,
        link: ch.link,
        status: ch.status,
        isMonetized: ch.is_monetized,
        clientName: ch.clients?.name ?? "—",
        assignedTo: track.assigned_to,
        month7: track.month_7,
        month8: track.month_8,
        month9: track.month_9,
        month10: track.month_10,
        month11: track.month_11,
        month12: track.month_12,
        notes: track.notes || "",
      };
    });

    return { tasks, staff: staffList };
  });

export const updatePublishingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.channelId) throw new Error("القناة مطلوبة");
    return {
      channelId: String(input.channelId),
      assignedTo: input.assignedTo !== undefined ? (input.assignedTo === "none" || !input.assignedTo ? null : String(input.assignedTo)) : undefined,
      month7: input.month7 !== undefined ? Boolean(input.month7) : undefined,
      month8: input.month8 !== undefined ? Boolean(input.month8) : undefined,
      month9: input.month9 !== undefined ? Boolean(input.month9) : undefined,
      month10: input.month10 !== undefined ? Boolean(input.month10) : undefined,
      month11: input.month11 !== undefined ? Boolean(input.month11) : undefined,
      month12: input.month12 !== undefined ? Boolean(input.month12) : undefined,
      notes: input.notes !== undefined ? String(input.notes) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRoleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    const roles = (userRoleData ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    const isEmployee = roles.includes("employee");
    const isStaff = isAdmin || isEmployee;

    if (!isStaff) throw new Error("صلاحيات غير كافية");

    // Fetch existing tracker record for channel
    const { data: existing } = await supabaseAdmin
      .from("channel_publishing_tracker")
      .select("*")
      .eq("channel_id", data.channelId)
      .eq("year", 2026)
      .maybeSingle();

    // Authorization Check:
    // If the user is an employee, they can only update if they are assigned to this channel
    if (isEmployee && !isAdmin) {
      if (!existing || existing.assigned_to !== context.userId) {
        throw new Error("لا يمكنك تعديل قناة غير معينة لك");
      }
      // Employees are not allowed to change the assignment
      if (data.assignedTo !== undefined && data.assignedTo !== existing.assigned_to) {
        throw new Error("لا يمكنك تغيير الموظف المسؤول عن القناة");
      }
    }

    // Construct payload
    const payload: any = {
      channel_id: data.channelId,
      year: 2026,
      updated_at: new Date().toISOString(),
    };

    // Admins can set or change assignment
    if (data.assignedTo !== undefined) {
      payload.assigned_to = data.assignedTo;
    } else if (!existing) {
      payload.assigned_to = null;
    }

    if (data.month7 !== undefined) payload.month_7 = data.month7;
    if (data.month8 !== undefined) payload.month_8 = data.month8;
    if (data.month9 !== undefined) payload.month_9 = data.month9;
    if (data.month10 !== undefined) payload.month_10 = data.month10;
    if (data.month11 !== undefined) payload.month_11 = data.month11;
    if (data.month12 !== undefined) payload.month_12 = data.month12;
    if (data.notes !== undefined) payload.notes = data.notes;

    const { error } = await supabaseAdmin
      .from("channel_publishing_tracker")
      .upsert(payload, { onConflict: "channel_id,year" });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importExcelPublishingData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 1. Assert admin (only admins can trigger Excel seeding)
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("صلاحيات غير كافية. يتطلب حساب مسؤول.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const XLSX = await import("xlsx");
    const fs = await import("fs");

    const filePath = "C:\\Users\\Mahmoud\\Downloads\\YouTube Channel Tracker.xlsx";
    if (!fs.existsSync(filePath)) {
      throw new Error(`لم يتم العثور على ملف الإكسيل في المسار المكتوب: ${filePath}`);
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    const headerIndex = 4;
    if (rawRows.length <= headerIndex) {
      throw new Error("ملف الإكسيل غير متوافق أو لا يحتوي على صفوف بيانات كافية.");
    }
    const dataRows = rawRows.slice(headerIndex + 1);

    // Fetch all channels, profiles, and roles
    const [{ data: channels }, { data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("channels").select("id, name"),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    const staffIds = new Set((roles ?? [])
      .filter((r) => r.role === "admin" || r.role === "employee")
      .map((r) => r.user_id));

    const staffProfiles = (profiles ?? []).filter((p) => staffIds.has(p.id));

    // Helper to find staff by name
    function findStaffByName(name: string) {
      if (!name) return null;
      const cleanName = name.trim().toLowerCase();
      return staffProfiles.find(
        (p) =>
          p.full_name?.trim().toLowerCase().includes(cleanName) ||
          p.email?.trim().toLowerCase().includes(cleanName)
      ) || null;
    }

    // Helper to find channel by name
    function findChannelByName(name: string) {
      if (!name) return null;
      const cleanName = name.trim().toLowerCase();
      return (channels ?? []).find(
        (ch) => ch.name.trim().toLowerCase() === cleanName
      ) || null;
    }

    let importedCount = 0;

    for (const row of dataRows) {
      if (!row || row.length === 0) continue;
      const channelName = String(row[0] || "").trim();
      if (!channelName || channelName === "undefined" || channelName === "null") continue;

      const employeeName = String(row[2] || "").trim();
      const july = row[5] === true || String(row[5]).toLowerCase() === "true" || row[5] === "1" || row[5] === 1;
      const august = row[6] === true || String(row[6]).toLowerCase() === "true" || row[6] === "1" || row[6] === 1;
      const september = row[7] === true || String(row[7]).toLowerCase() === "true" || row[7] === "1" || row[7] === 1;
      const october = row[8] === true || String(row[8]).toLowerCase() === "true" || row[8] === "1" || row[8] === 1;
      const november = row[9] === true || String(row[9]).toLowerCase() === "true" || row[9] === "1" || row[9] === 1;
      const december = row[10] === true || String(row[10]).toLowerCase() === "true" || row[10] === "1" || row[10] === 1;
      const notes = String(row[11] || "").trim();

      const dbChannel = findChannelByName(channelName);
      if (!dbChannel) continue;

      const dbStaff = employeeName ? findStaffByName(employeeName) : null;

      const payload = {
        channel_id: dbChannel.id,
        assigned_to: dbStaff?.id || null,
        year: 2026,
        month_7: july,
        month_8: august,
        month_9: september,
        month_10: october,
        month_11: november,
        month_12: december,
        notes: notes !== "undefined" && notes !== "null" ? notes : "",
      };

      const { error } = await supabaseAdmin
        .from("channel_publishing_tracker")
        .upsert(payload, { onConflict: "channel_id,year" });

      if (error) {
        console.error(`Error importing row for ${channelName}:`, error.message);
      } else {
        importedCount++;
      }
    }

    return { importedCount };
  });

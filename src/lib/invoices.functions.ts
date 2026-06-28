import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

// Helper to assert user has admin or employee role
async function assertStaff(context: any) {
  const { data: isStaff } = await context.supabase.rpc("is_staff", {
    _user_id: context.userId,
  });
  if (!isStaff) throw new Error("صلاحيات غير كافية - للموظفين فقط");
}

export type InvoiceInput = {
  clientId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  taxRate: number;
  discountRate: number;
  notes?: string;
  termsConditions?: string;
  items: Array<{
    channelId?: string | null;
    revenueId?: string | null;
    description: string;
    views: number;
    amount: number;
    clientPercentage?: number | null;
    clientShare?: number | null;
    companyShare?: number | null;
  }>;
};

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any): InvoiceInput => {
    if (!input?.clientId) throw new Error("العميل مطلوب");
    if (!input?.invoiceNumber) throw new Error("رقم الفاتورة مطلوب");
    if (!input?.issueDate) throw new Error("تاريخ الإصدار مطلوب");
    if (!input?.dueDate) throw new Error("تاريخ الاستحقاق مطلوب");
    if (!Array.isArray(input?.items) || input.items.length === 0) throw new Error("يجب إضافة بند واحد على الأقل بالفاتورة");
    return input as InvoiceInput;
  })
  .handler(async ({ data: input, context }) => {
    await assertStaff(context);
    const db = context.supabase;

    // Fetch company settings for details
    const { data: settings } = await db.from("app_settings").select("*").eq("id", true).single();

    // 1. Insert invoice header
    const { data: invoice, error: invErr } = await db.from("invoices").insert({
      invoice_number: input.invoiceNumber,
      client_id: input.clientId,
      status: "draft",
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency: input.currency || "USD",
      tax_rate: input.taxRate || 0,
      discount_rate: input.discountRate || 0,
      company_name: settings?.company_name || "Orient Digital",
      company_logo: settings?.logo_url || null,
      company_address: "Apartment 1, 2nd Floor, Building 113, Abu Youssef, Alexandria, Egypt",
      company_phone: "01125581125",
      company_email: "info@orientdigitals.com",
      company_tax_no: "TAX-123456-EG",
      company_cr_no: "CR-987654-ALEX",
      notes: input.notes || null,
      terms_conditions: input.termsConditions || "جميع المستحقات تدفع خلال 14 يوماً من تاريخ الفاتورة.",
    }).select("id").single();

    if (invErr || !invoice) throw new Error(invErr?.message ?? "فشل إنشاء الفاتورة");

    const invoiceId = invoice.id;

    // 2. Insert items
    const itemsPayload = input.items.map((it) => ({
      invoice_id: invoiceId,
      channel_id: it.channelId || null,
      revenue_id: it.revenueId || null,
      description: it.description,
      views: it.views || 0,
      amount: it.amount,
      client_percentage: it.clientPercentage || null,
      client_share: it.clientShare || it.amount,
      company_share: it.companyShare || 0,
    }));

    const { error: itemsErr } = await db.from("invoice_items").insert(itemsPayload);
    if (itemsErr) {
      // Rollback invoice on items error
      await db.from("invoices").delete().eq("id", invoiceId);
      throw new Error(itemsErr.message);
    }

    // 3. If items contain linked revenues, update monthly_revenues with invoice_id
    const linkedRevenueIds = input.items.map((it) => it.revenueId).filter(Boolean) as string[];
    if (linkedRevenueIds.length > 0) {
      await db
        .from("monthly_revenues")
        .update({ invoice_id: invoiceId })
        .in("id", linkedRevenueIds);
      
      // Update payments table with invoice_id too
      await db
        .from("payments")
        .update({ invoice_id: invoiceId })
        .in("revenue_id", linkedRevenueIds);
    }

    // 4. Trigger recalculation
    await db.rpc("recompute_invoice_totals", { _invoice_id: invoiceId });

    // 5. Activity log
    await db.from("invoice_activity_logs").insert({
      invoice_id: invoiceId,
      action: "إنشاء الفاتورة",
      notes: `تم إنشاء الفاتورة رقم ${input.invoiceNumber} كمسودة.`,
      created_by: context.userId,
    });

    return { id: invoiceId };
  });

export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.id) throw new Error("معرف الفاتورة مطلوب");
    if (!input?.invoiceNumber) throw new Error("رقم الفاتورة مطلوب");
    return input;
  })
  .handler(async ({ data: input, context }) => {
    await assertStaff(context);
    const db = context.supabase;

    // Clean old monthly_revenues links
    const { data: oldItems } = await db.from("invoice_items").select("revenue_id").eq("invoice_id", input.id);
    const oldRevIds = (oldItems ?? []).map((x) => x.revenue_id).filter(Boolean) as string[];
    if (oldRevIds.length > 0) {
      await db.from("monthly_revenues").update({ invoice_id: null }).in("id", oldRevIds);
      await db.from("payments").update({ invoice_id: null }).in("revenue_id", oldRevIds);
    }

    // 1. Update invoice header
    const { error: invErr } = await db.from("invoices").update({
      invoice_number: input.invoiceNumber,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      status: input.status || "draft",
      currency: input.currency || "USD",
      tax_rate: input.taxRate || 0,
      discount_rate: input.discountRate || 0,
      notes: input.notes || null,
      terms_conditions: input.termsConditions || null,
    }).eq("id", input.id);

    if (invErr) throw new Error(invErr.message);

    // 2. Clear old items and write new ones
    await db.from("invoice_items").delete().eq("invoice_id", input.id);

    const itemsPayload = input.items.map((it: any) => ({
      invoice_id: input.id,
      channel_id: it.channelId || null,
      revenue_id: it.revenueId || null,
      description: it.description,
      views: it.views || 0,
      amount: it.amount,
      client_percentage: it.clientPercentage || null,
      client_share: it.clientShare || it.amount,
      company_share: it.companyShare || 0,
    }));

    const { error: itemsErr } = await db.from("invoice_items").insert(itemsPayload);
    if (itemsErr) throw new Error(itemsErr.message);

    // 3. Link new monthly_revenues
    const newRevIds = input.items.map((it: any) => it.revenueId).filter(Boolean) as string[];
    if (newRevIds.length > 0) {
      await db.from("monthly_revenues").update({ invoice_id: input.id }).in("id", newRevIds);
      await db.from("payments").update({ invoice_id: input.id }).in("revenue_id", newRevIds);
    }

    // 4. Recalculate
    await db.rpc("recompute_invoice_totals", { _invoice_id: input.id });

    // 5. Activity log
    await db.from("invoice_activity_logs").insert({
      invoice_id: input.id,
      action: "تعديل الفاتورة",
      notes: `تم تعديل الفاتورة وتحديث بنودها وحالتها إلى (${input.status || "مسودة"}).`,
      created_by: context.userId,
    });

    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((id: any) => String(id))
  .handler(async ({ data: id, context }) => {
    await assertStaff(context);
    const db = context.supabase;

    const { error } = await db.from("invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((id: any) => String(id))
  .handler(async ({ data: id, context }) => {
    await assertStaff(context);
    const db = context.supabase;

    const { data: inv, error: getErr } = await db.from("invoices").select("*").eq("id", id).single();
    if (getErr || !inv) throw new Error("لم يتم العثور على الفاتورة");

    const { data: items } = await db.from("invoice_items").select("*").eq("invoice_id", id);

    const dupNumber = `${inv.invoice_number}-نسخة`;

    const { data: newInv, error: insErr } = await db.from("invoices").insert({
      ...inv,
      id: undefined,
      invoice_number: dupNumber,
      status: "draft",
      amount_paid: 0,
      remaining_balance: inv.grand_total,
      payment_date: null,
      created_at: undefined,
      updated_at: undefined,
    }).select("id").single();

    if (insErr || !newInv) throw new Error(insErr?.message ?? "فشل تكرار الفاتورة");

    const itemsPayload = (items ?? []).map((it) => ({
      invoice_id: newInv.id,
      description: it.description,
      views: it.views,
      amount: it.amount,
      client_percentage: it.client_percentage,
      client_share: it.client_share,
      company_share: it.company_share,
    }));

    await db.from("invoice_items").insert(itemsPayload);
    await db.rpc("recompute_invoice_totals", { _invoice_id: newInv.id });

    // Log action
    await db.from("invoice_activity_logs").insert({
      invoice_id: newInv.id,
      action: "تكرار الفاتورة",
      notes: `تم إنشاء هذه الفاتورة كتكرار للفاتورة رقم ${inv.invoice_number}.`,
      created_by: context.userId,
    });

    return { id: newInv.id };
  });

export const recordInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => {
    if (!input?.invoiceId) throw new Error("الفاتورة مطلوبة");
    if (!input?.amount || Number(input.amount) <= 0) throw new Error("المبلغ مطلوب ويجب أن يكون أكبر من صفر");
    return input;
  })
  .handler(async ({ data: input, context }) => {
    await assertStaff(context);
    const db = context.supabase;

    // Insert payment transaction directly linked to invoice
    const { error } = await db.from("payment_transactions").insert({
      invoice_id: input.invoiceId,
      amount: Number(input.amount),
      transaction_date: input.transactionDate || new Date().toISOString().slice(0, 10),
      vodafone_transfer_no: input.vodafoneTransferNo || null,
      notes: input.notes || null,
      created_by: context.userId,
    });

    if (error) throw new Error(error.message);

    // Activity log
    await db.from("invoice_activity_logs").insert({
      invoice_id: input.invoiceId,
      action: "دفع مباشر للفاتورة",
      notes: `تم تسجيل دفعة مالية بمبلغ $${Number(input.amount).toFixed(2)} رقم المعاملة (${input.vodafoneTransferNo || "—"}).`,
      created_by: context.userId,
    });

    return { ok: true };
  });

export const getInvoiceDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((id: any) => String(id))
  .handler(async ({ data: id, context }) => {
    const db = context.supabase;

    // 1. Fetch invoice
    const { data: invoice, error } = await db
      .from("invoices")
      .select("*, clients(id, name, email, phone, vodafone_cash, user_id)")
      .eq("id", id)
      .single();

    if (error || !invoice) throw new Error("لم يتم العثور على الفاتورة");

    // 2. Check permissions: client can only view their own
    const { data: isStaff } = await db.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff && invoice.clients?.user_id !== context.userId) {
      throw new Error("غير مصرح لك باستعراض هذه الفاتورة");
    }

    // 3. Fetch items, transactions (receipts), log history
    const [{ data: items }, { data: transactions }, { data: logs }] = await Promise.all([
      db.from("invoice_items").select("*, channels(name)").eq("invoice_id", id),
      db.from("payment_transactions").select("*").eq("invoice_id", id),
      db.from("invoice_activity_logs").select("*, profiles(full_name)").eq("invoice_id", id).order("created_at", { ascending: false }),
    ]);

    // Also fetch transactions linked through revenues associated with this invoice
    const { data: revItems } = await db.from("invoice_items").select("revenue_id").eq("invoice_id", id);
    const revenueIds = (revItems ?? []).map((ri) => ri.revenue_id).filter(Boolean) as string[];
    let allTransactions = [...(transactions ?? [])];
    
    if (revenueIds.length > 0) {
      const { data: revPayments } = await db.from("payments").select("id").in("revenue_id", revenueIds);
      const paymentIds = (revPayments ?? []).map((rp) => rp.id);
      if (paymentIds.length > 0) {
        const { data: revTrans } = await db.from("payment_transactions").select("*").in("payment_id", paymentIds);
        if (revTrans) {
          allTransactions = [...allTransactions, ...revTrans];
        }
      }
    }

    return {
      invoice,
      items: items ?? [],
      transactions: allTransactions,
      logs: (logs ?? []).map((l: any) => ({
        id: l.id,
        action: l.action,
        notes: l.notes,
        createdAt: l.created_at,
        createdBy: l.profiles?.full_name ?? "مستخدم النظام",
      })),
    };
  });

export const getPublicInvoiceDetails = createServerFn({ method: "GET" })
  .inputValidator((id: any) => String(id))
  .handler(async ({ data: id }) => {
    // For guest preview, check if secret key exists.
    // If not, we fall back to public client, which will read under public read policies
    const db = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : supabase;

    // 1. Fetch invoice
    const { data: invoice, error } = await db
      .from("invoices")
      .select("*, clients(id, name, email, phone, vodafone_cash)")
      .eq("id", id)
      .single();

    if (error || !invoice) throw new Error("لم يتم العثور على الفاتورة");

    // 2. Fetch items
    const { data: items } = await db.from("invoice_items").select("*").eq("invoice_id", id);

    return {
      invoice,
      items: items ?? [],
    };
  });

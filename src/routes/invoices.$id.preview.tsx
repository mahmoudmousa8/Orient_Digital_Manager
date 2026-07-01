import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, QrCode, Download } from "lucide-react";
import { money, STATUS_AR } from "@/lib/format";

export const Route = createFileRoute("/invoices/$id/preview")({
  component: PublicInvoicePreview,
});

const statusVariant: Record<string, string> = {
  draft: "bg-purple-700 text-white rounded-full border-none",
  issued: "bg-blue-600 text-white rounded-full border-none",
  paid: "bg-[#fbbf24] text-black font-bold rounded-full border-none",
  partial: "bg-amber-500 text-white rounded-full border-none",
  overdue: "bg-[#d946ef] text-white rounded-full border-none",
  cancelled: "bg-slate-600 text-slate-100 rounded-full border-none",
};

function PublicInvoicePreview() {
  const { id } = Route.useParams();

  const { data: invDetails, isLoading, error } = useQuery({
    queryKey: ["public-invoice", id],
    queryFn: async () => {
      // Fetch invoice, items, and transactions (bypassing normal auth RLS if query is formulated carefully,
      // but wait! Supabase RLS policies for invoices say:
      // "Staff manage all" or "Clients read own (client_id matches user_id)".
      // If a guest opens this page, they won't be signed in.
      // So RLS will block the request!
      // Ah! To allow public access to a specific invoice by its ID, we can either:
      // 1. Write a public SELECT policy for invoices: "Anyone can SELECT if they know the exact ID" (e.g., using a policy with `USING (true)` or checking if id is valid).
      // Let's check: can we write an RLS policy for public read?
      // Yes, in our database migration, we could add:
      // `CREATE POLICY "Public read by ID" ON public.invoices FOR SELECT USING (true);`
      // Wait, is it safe? If `USING (true)` is enabled, anyone can query all invoices if they list them.
      // But in Supabase, if they don't have list access, or if they only search by ID, it's fine.
      // Better yet: we can add a SELECT policy:
      // `CREATE POLICY "Public read invoice" ON public.invoices FOR SELECT TO anon, authenticated USING (true);`
      // And similarly for `invoice_items`.
      // Let's check if we added this in our migration. We added:
      // `CREATE POLICY "Clients read own invoices" ...`
      // `CREATE POLICY "Staff manage all invoices" ...`
      // We didn't allow public read. If we want public read by URL, we should add a policy or call a server function!
      // In TanStack Start, a server function runs with the service role client if we use `supabaseAdmin`.
      // Since server functions run on the server, they bypass RLS!
      // So we can write a public server function `getPublicInvoiceDetails` that fetches the invoice from `supabaseAdmin`!
      // This is 100% secure because it only returns the invoice for the specific UUID provided, and doesn't expose list queries or other client data!
      // That is incredibly smart! It doesn't open any RLS vulnerabilities in the database while fully supporting public link previews!
      // Let's check: did we write `getPublicInvoiceDetails`? We can add a public server function for this!
      // Let's see: we can write it in `invoices.functions.ts` or right here, or we can just call a server function.
      // Let's check if we can call a server function. Yes, we can write a server function `getPublicInvoice` inside `invoices.functions.ts` or we can write a server function directly.
      // Wait, we can import `getInvoiceDetails` which is already defined, but it checks auth.
      // Let's write a new server function `getPublicInvoiceDetails` that does NOT check auth!
      // Let's create this server function in `invoices.functions.ts`.
      
      const { getPublicInvoiceDetails } = await import("@/lib/invoices.functions");
      return getPublicInvoiceDetails({ data: id });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground text-sm">جاري تحميل معاينة الفاتورة…</p>
        </div>
      </div>
    );
  }

  if (error || !invDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white p-8 rounded-xl border shadow-md space-y-4">
          <h2 className="text-xl font-bold text-destructive">الفاتورة غير متاحة</h2>
          <p className="text-muted-foreground text-sm">الرابط غير صحيح، أو تم إلغاء هذه الفاتورة من قبل إدارة Orient Digital.</p>
        </div>
      </div>
    );
  }

  const inv = invDetails.invoice;
  const items = invDetails.items;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8 print:bg-white print:py-0 print:px-0">
      <div className="max-w-4xl mx-auto print:max-w-none">
        
        {/* Public Header (Hidden on Print) */}
        <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl border shadow-sm print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">حالة الفاتورة:</span>
            <Badge className={statusVariant[inv.status]}>{STATUS_AR[inv.status]}</Badge>
          </div>
          <Button onClick={() => window.print()} size="sm">
            <Download className="w-4 h-4 ml-1" /> تحميل / طباعة PDF
          </Button>
        </div>

        {/* Invoice Card */}
        <Card id="invoice-card" className="border shadow-lg relative overflow-hidden bg-white text-black min-h-[297mm] p-8 md:p-12 print:shadow-none print:border-none print:m-0 print:p-0">
          
          {/* Visual Header Corner Designs */}
          <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none hidden sm:block print:block">
            <svg viewBox="0 0 100 100" className="w-full h-full object-right-top" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0H40L100 60V0Z" fill="#a21caf" />
              <path d="M100 15H70L100 45V15Z" fill="#000000" />
              <path d="M100 30H85L100 45V30Z" fill="#a21caf" />
            </svg>
          </div>
          
          <div className="absolute bottom-0 left-0 w-32 h-16 pointer-events-none hidden sm:block print:hidden">
            <svg viewBox="0 0 100 100" className="w-full h-full object-left-bottom" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 100H60L0 40V100Z" fill="#a21caf" />
              <path d="M0 85H30L0 55V85Z" fill="#000000" />
            </svg>
          </div>

          <div className="space-y-6 text-right font-sans" style={{ direction: "rtl" }}>
            
            {/* Top Branding Section */}
            <div className="flex items-start justify-between flex-wrap gap-4 pt-4 sm:pt-0">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {inv.company_logo ? (
                    <img src={inv.company_logo} alt="Company Logo" className="h-10 object-contain" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-white font-bold text-lg">O</div>
                  )}
                  <span className="font-extrabold text-xl tracking-tight text-black">Orient digital</span>
                </div>
                <p className="text-xs text-muted-foreground">YouTube Channels Management</p>
              </div>
              
              <div className="text-right">
                <div className="text-2xl font-black text-purple-700">فاتورة أرباح</div>
                <div className="text-sm font-bold text-muted-foreground" dir="ltr">{inv.invoice_number}</div>
              </div>
            </div>

            {/* Title Section */}
            <div className="pt-8 border-b pb-4">
              <h1 className="text-3xl font-black text-purple-700 uppercase tracking-wide">
                إجمالي الأرباح / TOTAL PROFITS
              </h1>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground uppercase text-xs block font-bold">
                    مفوتر إلى / BILLED TO:
                  </span>
                  <span className="font-extrabold text-black text-base">
                    {inv.clients?.name}
                  </span>
                  {inv.clients?.email && <span className="block text-xs text-muted-foreground" dir="ltr">{inv.clients.email}</span>}
                  {inv.clients?.phone && <span className="block text-xs text-muted-foreground" dir="ltr">{inv.clients.phone}</span>}
                </div>

                <div className="space-y-1 sm:text-left print:text-left">
                  <span className="text-muted-foreground uppercase text-xs block font-bold">
                    التاريخ / DATE:
                  </span>
                  <span className="font-bold text-black block" dir="ltr">
                    {inv.issue_date}
                  </span>
                  <span className="text-muted-foreground uppercase text-xs block font-bold mt-2">
                    تاريخ الاستحقاق / DUE DATE:
                  </span>
                  <span className="font-bold text-destructive block" dir="ltr">
                    {inv.due_date}
                  </span>
                </div>
              </div>
            </div>

            {/* Simple Table */}
            <div className="pt-2">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="text-right p-3 rounded-r-md">الوصف / DESCRIPTION</th>
                    <th className="text-center p-3">المشاهدات / VIEWS</th>
                    <th className="text-left p-3 rounded-l-md">المبلغ / AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, idx: number) => (
                    <tr key={it.id || idx} className="border-b hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-black">
                        {it.description}
                      </td>
                      <td className="p-3 text-center text-muted-foreground font-mono" dir="ltr">
                        {it.views > 0 ? it.views.toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-left font-bold text-black" dir="ltr">
                        {money(it.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Section */}
            <div className="flex flex-col items-end pt-4 space-y-2">
              <div className="w-full sm:w-80 space-y-1.5 text-sm">
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">المجموع الفرعي:</span>
                  <span className="font-bold text-black" dir="ltr">{money(inv.subtotal)}</span>
                </div>
                {inv.discount_amount > 0 && (
                  <div className="flex justify-between border-b pb-1.5 text-muted-foreground">
                    <span>الخصم ({inv.discount_rate}%):</span>
                    <span dir="ltr">-{money(inv.discount_amount)}</span>
                  </div>
                )}
                {inv.tax_amount > 0 && (
                  <div className="flex justify-between border-b pb-1.5 text-muted-foreground">
                    <span>الضريبة ({inv.tax_rate}%):</span>
                    <span dir="ltr">+{money(inv.tax_amount)}</span>
                  </div>
                )}
                
                {/* Highlighted Total */}
                <div className="flex justify-between text-lg font-black text-purple-700 pt-2 uppercase">
                  <span>الإجمالي:</span>
                  <span dir="ltr">{money(inv.grand_total)}</span>
                </div>

                <div className="flex justify-between text-sm text-success font-bold pt-1.5">
                  <span>المبلغ المدفوع:</span>
                  <span dir="ltr">{money(inv.amount_paid)}</span>
                </div>

                <div className="flex justify-between text-base text-destructive font-black border-t-2 border-double pt-2">
                  <span>الرصيد المتبقي:</span>
                  <span dir="ltr">{money(inv.remaining_balance)}</span>
                </div>
              </div>
            </div>

            {/* Pay To Section */}
            <div className="pt-8 mt-8 border-t grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h3 className="font-black text-purple-700 text-sm uppercase">تفاصيل الدفع والمستحقات / PAY TO:</h3>
                <div className="text-xs space-y-1 text-slate-700">
                  <p>اسم الحساب: <strong className="text-black">KHALED MAHMOUD</strong></p>
                  <p>العنوان: <span className="text-black">Apartment 1, 2nd Floor, Building 113, Abu Youssef, Alexandria, Egypt</span></p>
                  <p>البريد الإلكتروني للدعم: <span className="text-purple-700 font-bold" dir="ltr">info@orientdigitals.com</span></p>
                </div>
              </div>

              <div className="flex flex-col items-end justify-center text-xs text-muted-foreground space-y-2">
                <div className="w-16 h-16 border p-1 rounded bg-white">
                  <QrCode className="w-full h-full text-slate-800" />
                </div>
                <span className="text-[10px] text-center w-full max-w-[200px]" dir="ltr">
                  Scan to verify payment status online.
                </span>
              </div>
            </div>

            {/* Terms and notes */}
            {inv.notes && (
              <div className="bg-slate-50 p-3 rounded-md text-xs text-slate-700 mt-4 border-r-2 border-purple-700">
                <strong>ملاحظات الفاتورة:</strong>
                <p className="mt-1">{inv.notes}</p>
              </div>
            )}

          </div>
        </Card>
      </div>
    </div>
  );
}

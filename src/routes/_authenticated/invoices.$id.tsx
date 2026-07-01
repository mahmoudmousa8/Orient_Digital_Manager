import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileText,
  Printer,
  Download,
  Share2,
  DollarSign,
  Calendar,
  History,
  ArrowRight,
  TrendingUp,
  User,
  Plus,
  QrCode,
  KeyRound,
  FileDown,
} from "lucide-react";
import { money, STATUS_AR } from "@/lib/format";
import { getInvoiceDetails, recordInvoicePayment } from "@/lib/invoices.functions";
import { Brand } from "@/components/brand";
import { exportInvoicePDF } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  component: InvoiceDetailsPage,
});

const statusVariant: Record<string, string> = {
  draft: "bg-purple-700 text-white rounded-full border-none",
  issued: "bg-blue-600 text-white rounded-full border-none",
  paid: "bg-[#fbbf24] text-black font-bold rounded-full border-none",
  partial: "bg-amber-500 text-white rounded-full border-none",
  overdue: "bg-[#d946ef] text-white rounded-full border-none",
  cancelled: "bg-slate-600 text-slate-100 rounded-full border-none",
};

function InvoiceDetailsPage() {
  const { id } = Route.useParams();
  const { isStaff } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getDetailsFn = useServerFn(getInvoiceDetails);
  const recordPaymentFn = useServerFn(recordInvoicePayment);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payTransferNo, setPayTransferNo] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [lang, setLang] = useState<"ar" | "en">("ar");

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoice-details", id],
    queryFn: () => getDetailsFn({ data: id }),
  });

  const payMut = useMutation({
    mutationFn: async () => {
      return recordPaymentFn({
        data: {
          invoiceId: id,
          amount: Number(payAmount),
          transactionDate: payDate,
          vodafoneTransferNo: payTransferNo,
          notes: payNotes,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-details", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("تم تسجيل الدفعة وإصدار الإيصال التلقائي");
      setPaymentOpen(false);
      setPayAmount("");
      setPayTransferNo("");
      setPayNotes("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handlePrint = () => {
    window.print();
  };

  const copyShareLink = () => {
    const link = `${window.location.origin}/invoices/${id}/preview`;
    navigator.clipboard.writeText(link);
    toast.success("تم نسخ رابط مشاركة الفاتورة");
    setShareOpen(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground text-sm">جاري تحميل تفاصيل الفاتورة…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center space-y-4">
        <h2 className="text-xl font-bold text-destructive">حدث خطأ أثناء تحميل الفاتورة</h2>
        <p className="text-muted-foreground">الفاتورة غير موجودة أو ليس لديك صلاحية لاستعراضها.</p>
        <Button asChild variant="outline">
          <Link to="/invoices">
            <ArrowRight className="w-4 h-4 ml-1" />
            العودة للفواتير
          </Link>
        </Button>
      </div>
    );
  }

  const inv = data.invoice;
  const items = data.items;
  const transactions = data.transactions;
  const logs = data.logs;

  return (
    <div className="space-y-6">
      {/* Action Buttons (Hidden on Print) */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/invoices">
              <ArrowRight className="w-4 h-4 ml-1" />
              قائمة الفواتير
            </Link>
          </Button>
          <Badge className={statusVariant[inv.status]}>{STATUS_AR[inv.status]}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={lang} onValueChange={(v: any) => setLang(v)}>
            <SelectTrigger className="w-28 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">الإنجليزية</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handlePrint} size="sm">
            <Download className="w-4 h-4 ml-1" /> تحميل / طباعة PDF
          </Button>
          <Button variant="outline" onClick={() => setShareOpen(true)} size="sm">
            <Share2 className="w-4 h-4 ml-1" /> مشاركة
          </Button>
          {isStaff && inv.remaining_balance > 0 && (
            <Button onClick={() => setPaymentOpen(true)} size="sm">
              <DollarSign className="w-4 h-4 ml-1" /> تسجيل دفعة
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Preview (Visible on screen and optimized for Print) */}
        <div className="lg:col-span-2 print:col-span-3 print:border-0 print:p-0">
          <Card id="invoice-card" className="border shadow-lg relative overflow-hidden bg-white text-black min-h-[297mm] p-8 md:p-12 print:shadow-none print:border-none print:m-0 print:p-0">
            {/* Visual Header Corner Designs (Branding from Reference image) */}
            <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none hidden sm:block print:block">
              {/* Abstract triangles matching Orient Digital's branding */}
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

            {/* Invoice Contents */}
            <div className={lang === "ar" ? "space-y-6 text-right font-sans" : "space-y-6 text-left font-sans"} style={{ direction: lang === "ar" ? "rtl" : "ltr" }}>
              
              {/* Top Branding Section */}
              <div className="flex items-start justify-between flex-wrap gap-4 pt-4 sm:pt-0">
                <div className="bg-white p-2.5 rounded-xl border shadow-sm inline-block">
                  <img src={(inv.company_logo && inv.company_logo.trim().length > 1) ? inv.company_logo : "/logo.png"} alt="Orient Digital" className="h-12 sm:h-16 w-auto max-w-[240px] object-contain" />
                </div>
                
                <div className={lang === "ar" ? "text-right" : "text-left"}>
                  <div className="text-2xl font-black text-purple-700">{lang === "ar" ? "فاتورة أرباح" : "PROFIT INVOICE"}</div>
                  <div className="text-sm font-bold text-neutral-500" dir="ltr">{inv.invoice_number}</div>
                </div>
              </div>

              {/* Title Section (Matching Attached Reference Image) */}
              <div className="pt-8 border-b pb-4">
                <h1 className={`text-3xl font-black text-purple-700 ${lang === 'en' ? 'uppercase tracking-wide' : ''}`}>
                  {lang === "ar" ? "إجمالي الأرباح" : "TOTAL PROFITS"}
                </h1>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
                  <div className="space-y-1">
                    <span className="text-black uppercase text-xs block font-extrabold">
                      {lang === "ar" ? "مفوتر إلى:" : "BILLED TO:"}
                    </span>
                    <span className="font-extrabold text-black text-base">
                      {inv.clients?.name}
                    </span>
                    {inv.clients?.email && <span className="block text-xs text-neutral-500" dir="ltr">{inv.clients.email}</span>}
                    {inv.clients?.phone && <span className="block text-xs text-neutral-500" dir="ltr">{inv.clients.phone}</span>}
                  </div>

                  <div className="space-y-1 sm:text-left print:text-left">
                    <span className="text-black uppercase text-xs block font-extrabold">
                      {lang === "ar" ? "التاريخ:" : "DATE:"}
                    </span>
                    <span className="font-bold text-black block" dir="ltr">
                      {inv.issue_date}
                    </span>
                    <span className="text-black uppercase text-xs block font-extrabold mt-2">
                      {lang === "ar" ? "تاريخ الاستحقاق:" : "DUE DATE:"}
                    </span>
                    <span className="font-bold text-amber-500 block" dir="ltr">
                      {inv.due_date}
                    </span>
                  </div>
                </div>
              </div>

              {/* Simple Table (Matching visual reference design) */}
              <div className="pt-2">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-y-2 border-slate-900 text-slate-950 font-black">
                      <th className={lang === "ar" ? "text-right p-3 rounded-r-md" : "text-left p-3 rounded-l-md"}>
                        {lang === "ar" ? "الوصف" : "DESCRIPTION"}
                      </th>
                      <th className="text-center p-3">
                        {lang === "ar" ? "المشاهدات" : "VIEWS"}
                      </th>
                      <th className={lang === "ar" ? "text-left p-3 rounded-l-md" : "text-right p-3 rounded-r-md"}>
                        {lang === "ar" ? "المبلغ" : "AMOUNT"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, idx: number) => (
                      <tr key={it.id || idx} className="border-b hover:bg-slate-50/50">
                        <td className="p-3 font-medium text-black">
                          {it.description}
                        </td>
                        <td className="p-3 text-center text-neutral-500 font-mono" dir="ltr">
                          {it.views > 0 ? it.views.toLocaleString() : "—"}
                        </td>
                        <td className={lang === "ar" ? "p-3 text-left font-bold text-black" : "p-3 text-right font-bold text-black"} dir="ltr">
                          {money(it.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Section (Matching visual reference design) */}
              <div className="flex flex-col items-end pt-4 space-y-2">
                <div className="w-full sm:w-80 space-y-1.5 text-sm">
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-neutral-500">{lang === "ar" ? "المجموع الفرعي:" : "Subtotal:"}</span>
                    <span className="font-bold text-black" dir="ltr">{money(inv.subtotal)}</span>
                  </div>
                  {inv.discount_amount > 0 && (
                    <div className="flex justify-between border-b pb-1.5 text-neutral-500">
                      <span>{lang === "ar" ? `الخصم (${inv.discount_rate}%):` : `Discount (${inv.discount_rate}%):`}</span>
                      <span dir="ltr">-{money(inv.discount_amount)}</span>
                    </div>
                  )}
                  {inv.tax_amount > 0 && (
                    <div className="flex justify-between border-b pb-1.5 text-neutral-500">
                      <span>{lang === "ar" ? `الضريبة (${inv.tax_rate}%):` : `Tax (${inv.tax_rate}%):`}</span>
                      <span dir="ltr">+{money(inv.tax_amount)}</span>
                    </div>
                  )}
                  
                  {/* Highlighted Total */}
                  <div className="flex justify-between text-lg font-black text-black pt-2 uppercase">
                    <span>{lang === "ar" ? "الإجمالي:" : "TOTAL:"}</span>
                    <span dir="ltr">{money(inv.grand_total)}</span>
                  </div>

                  <div className="flex justify-between text-sm text-black font-bold pt-1.5">
                    <span>{lang === "ar" ? "المبلغ المدفوع:" : "Amount Paid:"}</span>
                    <span dir="ltr">{money(inv.amount_paid)}</span>
                  </div>

                  <div className="flex justify-between text-base text-black font-black border-t-2 border-double pt-2">
                    <span>{lang === "ar" ? "الرصيد المتبقي:" : "Remaining Balance:"}</span>
                    <span dir="ltr">{money(inv.remaining_balance)}</span>
                  </div>
                </div>
              </div>

              {/* Pay To Section (Matches reference design) */}
              <div className="pt-8 mt-8 border-t">
                <div className="space-y-1">
                  <h3 className="font-black text-purple-700 text-sm uppercase">
                    {lang === "ar" ? "تفاصيل الدفع والمستحقات:" : "PAY TO:"}
                  </h3>
                  <div className="text-xs space-y-1 text-slate-700">
                    <p>{lang === "ar" ? "اسم الحساب:" : "Account Name:"} <strong className="text-black">KHALED MAHMOUD</strong></p>
                    <p>{lang === "ar" ? "العنوان:" : "Address:"} <span className="text-black">Apartment 1, 2nd Floor, Building 113, Abu Youssef, Alexandria, Egypt</span></p>
                    <p>{lang === "ar" ? "البريد الإلكتروني للدعم:" : "Support Email:"} <a href="mailto:info@orientdigitals.com" className="text-purple-700 font-bold" dir="ltr">info@orientdigitals.com</a></p>
                  </div>
                </div>
              </div>

              {/* Terms and notes */}
              {inv.notes && (
                <div className="bg-slate-50 p-3 rounded-md text-xs text-slate-700 mt-4 border-r-2 border-purple-700">
                  <strong>{lang === "ar" ? "ملاحظات الفاتورة:" : "Invoice Notes:"}</strong>
                  <p className="mt-1">{inv.notes}</p>
                </div>
              )}

            </div>
          </Card>
        </div>

        {/* Sidebar Panel (Logs, Payments, Settings) - Hidden on Print */}
        <div className="space-y-6 print:hidden">
          
          {/* Quick Metrics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ملخص الدفع للفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 p-2.5 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">المدفوع</div>
                  <div className="text-base font-bold text-success" dir="ltr">{money(inv.amount_paid)}</div>
                </div>
                <div className="bg-muted/50 p-2.5 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">المتبقي</div>
                  <div className="text-base font-bold text-destructive" dir="ltr">{money(inv.remaining_balance)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>سجل الدفعات</span>
                <History className="w-4 h-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead className="text-right">المرجع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-xs">
                        لا توجد دفعات مسجلة لهذه الفاتورة
                      </TableCell>
                    </TableRow>
                  )}
                  {transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell dir="ltr" className="text-xs text-right">{tx.transaction_date}</TableCell>
                      <TableCell dir="ltr" className="text-left font-bold text-success text-xs">{money(tx.amount)}</TableCell>
                      <TableCell className="text-xs text-right truncate max-w-[80px]" title={tx.vodafone_transfer_no ?? ""}>
                        {tx.vodafone_transfer_no || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">سجل الأنشطة والمتابعة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative border-r pr-4 space-y-4 text-xs">
                {logs.map((log: any) => (
                  <div key={log.id} className="relative">
                    {/* Circle marker */}
                    <div className="absolute -right-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-primary border border-background"></div>
                    <div className="font-semibold text-black">{log.action}</div>
                    <p className="text-muted-foreground mt-0.5">{log.notes}</p>
                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
                      <span>بواسطة: {log.createdBy}</span>
                      <span dir="ltr">{new Date(log.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة للفاتورة</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); payMut.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pay-amount">المبلغ (USD) *</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={inv.remaining_balance}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                defaultValue={inv.remaining_balance}
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pay-date">تاريخ الدفعة *</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay-ref">رقم تحويل فودافون كاش</Label>
                <Input
                  id="pay-ref"
                  value={payTransferNo}
                  onChange={(e) => setPayTransferNo(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-notes">ملاحظات</Label>
              <Input
                id="pay-notes"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="تفاصيل إضافية"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentOpen(false)} type="button">إلغاء</Button>
              <Button type="submit" disabled={payMut.isPending || !payAmount}>
                {payMut.isPending ? "جاري الحفظ..." : "تسجيل الدفعة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>مشاركة الفاتورة مع العميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              يمكنك نسخ رابط المعاينة المباشر للفاتورة وإرساله للعميل لمطابقة الأرباح والدفع مباشرة دون الحاجة لتسجيل دخول.
            </p>
            <div className="flex gap-2">
              <Input
                value={`${window.location.origin}/invoices/${id}/preview`}
                readOnly
                dir="ltr"
                className="bg-muted"
              />
              <Button onClick={copyShareLink}>نسخ الرابط</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Search, Printer, Receipt, RefreshCw, X } from "lucide-react";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/receipts")({
  component: ReceiptsPage,
});

type ReceiptData = {
  id: string;
  receipt_number: string;
  invoice_id: string | null;
  client_id: string;
  amount: number;
  payment_method: string;
  receipt_date: string;
  notes: string | null;
  created_at: string;
  clients?: { name: string; email: string | null; phone: string | null } | null;
  invoices?: { invoice_number: string } | null;
};

function ReceiptsPage() {
  const { isStaff, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [printTarget, setPrintTarget] = useState<ReceiptData | null>(null);

  // Queries
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["receipts", isStaff],
    queryFn: async () => {
      let q = supabase
        .from("receipts")
        .select("*, clients(name, email, phone), invoices(invoice_number)")
        .order("created_at", { ascending: false });

      if (!isStaff) {
        const { data: clientRec } = await supabase.from("clients").select("id").eq("user_id", user?.id || "").single();
        if (clientRec) {
          q = q.eq("client_id", clientRec.id);
        } else {
          return [];
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as ReceiptData[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((rec) => {
      if (filterClient !== "all" && rec.client_id !== filterClient) return false;
      if (q && !rec.receipt_number.toLowerCase().includes(q) && !(rec.clients?.name ?? "").toLowerCase().includes(q) && !(rec.invoices?.invoice_number ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [receipts, search, filterClient]);

  const openPrintReceipt = (rec: ReceiptData) => {
    setPrintTarget(rec);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div className="space-y-6">
      {/* Receipts list (Hidden on Print) */}
      <div className="space-y-6 print:hidden">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Receipt className="w-8 h-8 text-primary" />
            إيصالات الدفع
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isStaff ? "سجل إيصالات السداد التلقائية لمدفوعات العملاء" : "إيصالات السداد الخاصة بمدفوعاتك"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم الإيصال، الفاتورة أو العميل…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input-padding"
            />
          </div>
          {isStaff && (
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="اختر العميل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العملاء</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الإيصال</TableHead>
                  {isStaff && <TableHead className="text-right">العميل</TableHead>}
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">تاريخ الإيصال</TableHead>
                  <TableHead className="text-right">طريقة الدفع</TableHead>
                  <TableHead className="text-left">المبلغ المدفوع</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={isStaff ? 7 : 6} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        جاري تحميل الإيصالات…
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isStaff ? 7 : 6} className="text-center text-muted-foreground py-12">
                      لا توجد إيصالات مسجلة
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-bold text-right">{rec.receipt_number}</TableCell>
                    {isStaff && <TableCell className="text-right">{rec.clients?.name ?? "—"}</TableCell>}
                    <TableCell className="text-right">{rec.invoices?.invoice_number ?? "—"}</TableCell>
                    <TableCell dir="ltr" className="text-right">{rec.receipt_date}</TableCell>
                    <TableCell className="text-right">{rec.payment_method}</TableCell>
                    <TableCell dir="ltr" className="text-left text-white font-bold">{money(rec.amount)}</TableCell>
                    <TableCell className="text-center">
                      <Button size="icon" variant="ghost" onClick={() => openPrintReceipt(rec)}>
                        <Printer className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Printable Receipt Layout (Visible only on Print) */}
      {printTarget && (
        <div className="hidden print:block w-full max-w-[150mm] mx-auto p-6 border-2 border-double border-slate-300 font-sans text-right" style={{ direction: "rtl" }}>
          
          {/* Logo and company info */}
          <div className="flex justify-between items-start border-b pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white font-bold">O</div>
                <span className="font-black text-lg text-black">Orient Digital</span>
              </div>
              <p className="text-[10px] text-muted-foreground">إدارة القنوات الرقمية والتسوية المالية</p>
            </div>
            <div className="text-left">
              <h2 className="text-base font-extrabold text-purple-700">إيصال سداد نقدي</h2>
              <p className="text-xs font-bold text-slate-700" dir="ltr">{printTarget.receipt_number}</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex justify-between">
              <span>تاريخ الإيصال: <strong>{printTarget.receipt_date}</strong></span>
              <span>طريقة الدفع: <strong>{printTarget.payment_method}</strong></span>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg space-y-2 border">
              <p>استلمنا من السيد/السادة: <strong className="text-sm font-bold text-black">{printTarget.clients?.name}</strong></p>
              {printTarget.invoices?.invoice_number && (
                <p>وذلك سداداً للفاتورة رقم: <strong className="font-bold text-slate-800">{printTarget.invoices.invoice_number}</strong></p>
              )}
              <p className="flex justify-between items-center bg-white p-2 border rounded-md font-bold mt-2">
                <span>مبلغ وقدره:</span>
                <span className="text-success text-base font-black" dir="ltr">{money(printTarget.amount)}</span>
              </p>
            </div>

            {printTarget.notes && (
              <div className="text-[10px] text-slate-600">
                ملاحظات: {printTarget.notes}
              </div>
            )}

            <div className="flex justify-between pt-8 mt-8 border-t text-[10px]">
              <div className="text-center w-36">
                <p className="border-b pb-8">توقيع المستلم (إدارة المالية)</p>
                <p className="mt-1 font-bold">Orient Digital</p>
              </div>
              <div className="text-center w-36">
                <p className="border-b pb-8">توقيع المسدد (العميل)</p>
                <p className="mt-1 font-bold">{printTarget.clients?.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, Plus, Pencil, Trash2, Search, Printer, FileText, Calendar, DollarSign, Wallet, CheckCircle2, ShieldAlert, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/use-language";
import { useSettings } from "@/hooks/use-settings";
import { money } from "@/lib/format";

export function egp(n: number | string | null | undefined, showSign: "" | "+" | "-" = "") {
  const v = Number(n ?? 0);
  const numStr = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v);
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr">
      {showSign === "-" && <span>-</span>}
      {showSign === "+" && <span>+</span>}
      <span className="text-[10px] font-bold text-slate-400 mr-0.5">ج.م</span>
      <span>{numStr}</span>
    </span>
  );
}

type Employee = {
  id: string;
  name: string;
  job_title: string;
  salary: number;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

type Payroll = {
  id: string;
  employee_id: string;
  period_month: string;
  salary: number;
  attendance_days: number;
  absence_days: number;
  deductions: number;
  bonuses: number;
  net_pay: number;
  status: "draft" | "paid";
  payment_date: string | null;
  notes: string | null;
  employees?: {
    name: string;
    job_title: string;
  } | null;
};

export function EmployeesPage() {
  const { isStaff, isAdmin } = useAuth();
  const { t, lang } = useLanguage();
  const { data: settings } = useSettings();
  const qc = useQueryClient();

  // Dialog States
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null);
  const [deleteEmployeeId, setDeleteEmployeeId] = useState<string | null>(null);

  // Search & Filter States
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [payrollSearch, setPayrollSearch] = useState("");
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear().toString());
  const [payrollMonth, setPayrollMonth] = useState(
    (new Date().getMonth() + 1).toString().padStart(2, "0")
  );

  // Print States
  const [printType, setPrintType] = useState<"sheet" | "payslip" | null>(null);
  const [printTargetPayroll, setPrintTargetPayroll] = useState<Payroll | null>(null);

  // Employee Form State
  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    job_title: "",
    salary: "",
    phone: "",
    notes: "",
  });

  // Payroll Form State
  const [payrollForm, setPayrollForm] = useState({
    attendance_days: 30,
    absence_days: 0,
    deductions: 0,
    bonuses: 0,
    status: "draft" as "draft" | "paid",
    notes: "",
  });

  // Clean print state on completion
  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintType(null);
      setPrintTargetPayroll(null);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  // Fetch Employees List
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Employee[];
    },
  });

  // Filter Period for payroll query
  const selectedPeriodDate = useMemo(() => {
    return `${payrollYear}-${payrollMonth}-01`;
  }, [payrollYear, payrollMonth]);

  // Fetch Payroll List
  const { data: payrolls = [], isLoading: isLoadingPayroll } = useQuery({
    queryKey: ["payrolls", selectedPeriodDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payrolls")
        .select("*, employees(name, job_title)")
        .eq("period_month", selectedPeriodDate);
      if (error) throw error;
      return data as unknown as Payroll[];
    },
  });

  // Filtered lists
  const filteredEmployees = useMemo(() => {
    const s = employeeSearch.trim().toLowerCase();
    return employees.filter((e) =>
      e.name.toLowerCase().includes(s) || e.job_title.toLowerCase().includes(s)
    );
  }, [employees, employeeSearch]);

  const filteredPayrolls = useMemo(() => {
    const s = payrollSearch.trim().toLowerCase();
    return payrolls.filter((p) =>
      (p.employees?.name ?? "").toLowerCase().includes(s) ||
      (p.employees?.job_title ?? "").toLowerCase().includes(s)
    );
  }, [payrolls, payrollSearch]);

  const payrollStats = useMemo(() => {
    let totalBasic = 0;
    let totalNet = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let totalDeductions = 0;
    let totalBonuses = 0;

    payrolls.forEach((p) => {
      const sal = Number(p.salary || 0);
      const abs = Number(p.absence_days || 0);
      const ded = Number(p.deductions || 0);
      const bon = Number(p.bonuses || 0);
      const net = Number(p.net_pay || 0);

      totalBasic += sal;
      totalNet += net;

      const absenceDed = Math.round((abs * (sal / 30)) * 100) / 100;
      totalDeductions += ded + absenceDed;
      totalBonuses += bon;

      if (p.status === "paid") {
        totalPaid += net;
        paidCount++;
      } else {
        totalPending += net;
        pendingCount++;
      }
    });

    return {
      totalBasic,
      totalNet,
      totalPaid,
      totalPending,
      paidCount,
      pendingCount,
      totalDeductions,
      totalBonuses,
    };
  }, [payrolls]);

  // Employee CRUD Mutations
  const saveEmployeeMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: employeeForm.name,
        job_title: employeeForm.job_title,
        salary: Number(employeeForm.salary),
        phone: employeeForm.phone || null,
        notes: employeeForm.notes || null,
      };

      if (editingEmployee) {
        const { error } = await supabase
          .from("employees")
          .update(payload)
          .eq("id", editingEmployee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      toast.success(
        lang === "ar"
          ? "تم حفظ بيانات الموظف بنجاح"
          : "Employee details saved successfully"
      );
      setEmployeeDialogOpen(false);
      resetEmployeeForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteEmployeeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      toast.success(
        lang === "ar" ? "تم حذف الموظف بنجاح" : "Employee deleted successfully"
      );
      setDeleteEmployeeId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Payroll Mutations
  const deletePayrollMonthMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("employee_payrolls")
        .delete()
        .eq("period_month", selectedPeriodDate);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      toast.success(
        lang === "ar"
          ? "تم مسح مسير رواتب هذا الشهر بالكامل"
          : "Monthly payroll cleared successfully"
      );
    },
    onError: (err: any) => toast.error(err.message),
  });

  const generatePayrollMut = useMutation({
    mutationFn: async () => {
      if (employees.length === 0) {
        throw new Error(
          lang === "ar"
            ? "لا يوجد موظفون مضافون لتوليد مسير رواتب لهم"
            : "No employees available to generate payroll for"
        );
      }

      // Check which employees already have payroll for this period
      const existingEmpIds = payrolls.map((p) => p.employee_id);
      const employeesToInsert = employees.filter(
        (e) => !existingEmpIds.includes(e.id)
      );

      if (employeesToInsert.length === 0) {
        throw new Error(
          lang === "ar"
            ? "تم توليد مسير رواتب لجميع الموظفين بالفعل لهذا الشهر"
            : "Payroll already generated for all employees in this period"
        );
      }

      const payload = employeesToInsert.map((e) => ({
        employee_id: e.id,
        period_month: selectedPeriodDate,
        salary: e.salary,
        attendance_days: 30,
        absence_days: 0,
        deductions: 0,
        bonuses: 0,
        net_pay: e.salary,
        status: "draft",
        notes: null,
      }));

      const { error } = await supabase.from("employee_payrolls").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      toast.success(
        lang === "ar"
          ? "تم توليد مسير الرواتب بنجاح"
          : "Monthly payroll generated successfully"
      );
    },
    onError: (err: any) => toast.error(err.message),
  });

  const savePayrollMut = useMutation({
    mutationFn: async () => {
      if (!editingPayroll) return;

      const salary = editingPayroll.salary;
      const att = Number(payrollForm.attendance_days);
      const abs = Number(payrollForm.absence_days);
      const ded = Number(payrollForm.deductions);
      const bon = Number(payrollForm.bonuses);

      // Calculation: Basic Salary - Deductions + Bonuses - (Absence Days * (Basic Salary / 30))
      const calculatedNet = Math.max(0, Math.round((salary - ded + bon - (abs * (salary / 30))) * 100) / 100);

      const payload = {
        attendance_days: att,
        absence_days: abs,
        deductions: ded,
        bonuses: bon,
        net_pay: calculatedNet,
        status: payrollForm.status,
        notes: payrollForm.notes || null,
        payment_date: payrollForm.status === "paid" ? new Date().toISOString().slice(0, 10) : null,
      };

      const { error } = await supabase
        .from("employee_payrolls")
        .update(payload)
        .eq("id", editingPayroll.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      toast.success(
        lang === "ar"
          ? "تم تحديث سجل راتب الموظف"
          : "Employee payroll record updated"
      );
      setPayrollDialogOpen(false);
      setEditingPayroll(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Helpers
  function resetEmployeeForm() {
    setEmployeeForm({
      name: "",
      job_title: "",
      salary: "",
      phone: "",
      notes: "",
    });
    setEditingEmployee(null);
  }

  const handleOpenAddEmployee = () => {
    resetEmployeeForm();
    setEmployeeDialogOpen(true);
  };

  const handleOpenEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmployeeForm({
      name: emp.name,
      job_title: emp.job_title,
      salary: emp.salary.toString(),
      phone: emp.phone || "",
      notes: emp.notes || "",
    });
    setEmployeeDialogOpen(true);
  };

  const handleOpenEditPayroll = (pay: Payroll) => {
    setEditingPayroll(pay);
    setPayrollForm({
      attendance_days: pay.attendance_days,
      absence_days: pay.absence_days,
      deductions: pay.deductions,
      bonuses: pay.bonuses,
      status: pay.status,
      notes: pay.notes || "",
    });
    setPayrollDialogOpen(true);
  };

  // Printing functions
  const triggerPrintSheet = () => {
    setPrintType("sheet");
    setPrintTargetPayroll(null);
    const originalTitle = document.title;
    document.title = lang === "ar"
      ? `مسير رواتب مجمع - ${payrollYear}-${payrollMonth}`
      : `Collective Payroll - ${payrollYear}-${payrollMonth}`;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 500);
    }, 200);
  };

  const triggerPrintPayslip = (pay: Payroll) => {
    setPrintType("payslip");
    setPrintTargetPayroll(pay);
    const originalTitle = document.title;
    const employeeName = pay.employees?.name || "موظف";
    document.title = lang === "ar"
      ? `قسيمة راتب - ${employeeName} - ${payrollYear}-${payrollMonth}`
      : `Payslip - ${employeeName} - ${payrollYear}-${payrollMonth}`;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 500);
    }, 200);
  };

  // Render Printable Elements (Only visible on @media print)
  const printableArea = useMemo(() => {
    if (!printType) return null;

    const logoSrc = settings?.logo_url || "/logo.png";

    if (printType === "sheet") {
      const totalBasic = payrolls.reduce((sum, p) => sum + p.salary, 0);
      const totalDeductions = payrolls.reduce((sum, p) => sum + p.deductions + Math.round((p.absence_days * (p.salary / 30)) * 100) / 100, 0);
      const totalBonuses = payrolls.reduce((sum, p) => sum + p.bonuses, 0);
      const totalNet = payrolls.reduce((sum, p) => sum + p.net_pay, 0);

      return (
        <div id="invoice-card" className="hidden print:block w-full bg-white text-black font-sans relative print-container" style={{ direction: "rtl" }}>
          <style>{`
            @media print {
              @page {
                margin: 0 !important;
              }
              html, body, #root, [data-reactroot], main, .min-h-screen, div {
                background-color: #ffffff !important;
                background: #ffffff !important;
                color: #000000 !important;
              }
            }
            .print-container table th {
              background-color: transparent !important;
              color: #000000 !important;
              border-bottom: 2px solid #000000 !important;
              border-top: 2px solid #000000 !important;
              font-weight: 900 !important;
            }
            .print-container table td {
              background-color: transparent !important;
              color: #000000 !important;
              border-bottom: 1px solid #e2e8f0 !important;
            }
          `}</style>
          {/* Visual Header Corner Designs (Branding matching Reference Image) */}
          <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full object-right-top" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0H40L100 60V0Z" fill="#a21caf" />
              <path d="M100 15H70L100 45V15Z" fill="#000000" />
              <path d="M100 30H85L100 45V30Z" fill="#a21caf" />
            </svg>
          </div>

          {/* Contents */}
          <div className="p-10 space-y-4 text-right font-sans" style={{ direction: "rtl" }}>
            {/* Top Branding Section */}
            <div className="flex items-start justify-between flex-wrap gap-4 pt-4">
              <div className="bg-white rounded-xl border shadow-sm flex items-center justify-center h-16 w-16 p-2">
                <img src={logoSrc} alt="Orient Digital" className="h-full w-full object-contain" />
              </div>
              <div className={lang === "ar" ? "text-left" : "text-right"}>
                <div className="text-sm font-bold text-neutral-500" dir="ltr">
                  PAY-{payrollYear}{payrollMonth}-ALL
                </div>
              </div>
            </div>

            {/* Title Section (Matching Profit Invoice style) */}
            <div className="pt-4 border-b pb-2">
              <h1 className="text-2xl font-black text-purple-700">
                {lang === "ar" ? "مسير الرواتب الشهري" : "MONTHLY PAYROLL SHEET"}
              </h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
                <div className="space-y-1">
                  <span className="text-black uppercase text-[10px] block font-extrabold">
                    {lang === "ar" ? "معد إلى:" : "PREPARED FOR:"}
                  </span>
                  <span className="font-extrabold text-black text-sm">
                    {lang === "ar" ? "شؤون الموظفين والرواتب" : "HR & Payroll Department"}
                  </span>
                  <span className="block text-[10px] text-neutral-500">
                    {lang === "ar" ? "شركة Orient Digital" : "Orient Digital Company"}
                  </span>
                </div>
                <div className="space-y-1 sm:text-left print:text-left">
                  <span className="text-black uppercase text-[10px] block font-extrabold">
                    {lang === "ar" ? "التاريخ:" : "DATE:"}
                  </span>
                  <span className="font-bold text-black block" dir="ltr">
                    {payrollYear}-{payrollMonth}-01
                  </span>
                  <span className="text-black uppercase text-[10px] block font-extrabold mt-1">
                    {lang === "ar" ? "فترة المستحقات:" : "PAYROLL PERIOD:"}
                  </span>
                  <span className="font-bold text-amber-500 block" dir="ltr">
                    {payrollYear} / {payrollMonth}
                  </span>
                </div>
              </div>
            </div>

            {/* Table Section (Matching Invoice Style) */}
            <div className="pt-2">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-y-2 border-slate-900 text-slate-950 font-black">
                    <th className="p-2 text-right">{lang === "ar" ? "الموظف" : "Employee"}</th>
                    <th className="p-2 text-right">{lang === "ar" ? "الوظيفة" : "Job Title"}</th>
                    <th className="p-2 text-left">{lang === "ar" ? "الراتب الأساسي" : "Basic Salary"}</th>
                    <th className="p-2 w-14 text-center px-1">{lang === "ar" ? "الحضور" : "Att."}</th>
                    <th className="p-2 w-14 text-center px-1">{lang === "ar" ? "الغياب" : "Abs."}</th>
                    <th className="p-2 text-left text-red-650">{lang === "ar" ? "الخصومات" : "Deductions"}</th>
                    <th className="p-2 text-left text-emerald-650">{lang === "ar" ? "المكافآت" : "Bonuses"}</th>
                    <th className="p-2 text-left font-bold">{lang === "ar" ? "صافي المستحق" : "Net Due"}</th>
                    <th className="p-2 w-48 text-center">{lang === "ar" ? "إمضاء المستلم" : "Signature"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payrolls.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-2 font-bold text-slate-900">{p.employees?.name}</td>
                      <td className="p-2 text-slate-600">{p.employees?.job_title}</td>
                      <td className="p-2 text-left font-semibold" dir="ltr">{egp(p.salary)}</td>
                      <td className="p-2 text-center font-mono px-1 w-14">{p.attendance_days}</td>
                      <td className="p-2 text-center font-mono px-1 w-14">{p.absence_days}</td>
                      <td className="p-2 text-left text-red-650 font-semibold" dir="ltr">-{egp(p.deductions + Math.round((p.absence_days * (p.salary / 30)) * 100) / 100)}</td>
                      <td className="p-2 text-left text-emerald-600 font-semibold" dir="ltr">+{egp(p.bonuses)}</td>
                      <td className="p-2 text-left font-black text-purple-700" dir="ltr">{egp(p.net_pay)}</td>
                      <td className="p-2 text-center text-slate-400 text-[9px] border-r border-slate-200 w-48 font-bold">
                        {lang === "ar" ? "التوقيع: ............" : "Sign: ............"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Section (Matching Invoice Style) */}
            <div className="flex flex-col items-end pt-2 space-y-1">
              <div className="w-full sm:w-64 space-y-1 text-xs">
                <div className="flex justify-between border-b pb-1">
                  <span className="text-neutral-500">{lang === "ar" ? "المجموع الفرعي:" : "Subtotal:"}</span>
                  <span className="font-bold text-black" dir="ltr">{egp(totalBasic)}</span>
                </div>
                <div className="flex justify-between border-b pb-1 text-neutral-500">
                  <span>{lang === "ar" ? "إجمالي المكافآت (+):" : "Total Bonuses (+):"}</span>
                  <span className="text-emerald-600 font-bold" dir="ltr">+{egp(totalBonuses)}</span>
                </div>
                <div className="flex justify-between border-b pb-1 text-neutral-500">
                  <span>{lang === "ar" ? "إجمالي الخصومات (-):" : "Total Deductions (-):"}</span>
                  <span className="text-red-600 font-bold" dir="ltr">-{egp(totalDeductions)}</span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-black text-purple-700">
                  <span>{lang === "ar" ? "صافي الرواتب الإجمالي:" : "Net Total Payroll:"}</span>
                  <span dir="ltr">{egp(totalNet)}</span>
                </div>
              </div>
            </div>

            {/* Signatures block at the bottom */}
            <div className="flex justify-between items-center mt-8 px-4 text-[10px]">
              <div className="space-y-4">
                <p className="font-bold text-slate-700">
                  {lang === "ar" ? "توقيع المسؤول المالي" : "Finance Controller"}
                </p>
                <div className="border-b border-dashed border-slate-400 w-36 pt-2"></div>
              </div>
              <div className="space-y-4 text-left">
                <p className="font-bold text-slate-700">
                  {lang === "ar" ? "اعتماد المدير العام" : "CEO Approval"}
                </p>
                <div className="border-b border-dashed border-slate-400 w-36 pt-2"></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (printType === "payslip" && printTargetPayroll) {
      const p = printTargetPayroll;
      const isPaid = p.status === "paid";
      const paidAmt = isPaid ? p.net_pay : 0;
      const remainingAmt = p.net_pay - paidAmt;

      return (
        <div id="invoice-card" className="hidden print:block w-full bg-white text-black font-sans relative print-container" style={{ direction: "rtl" }}>
          <style>{`
            @media print {
              @page {
                margin: 0 !important;
              }
              html, body, #root, [data-reactroot], main, .min-h-screen, div {
                background-color: #ffffff !important;
                background: #ffffff !important;
                color: #000000 !important;
              }
            }
            .print-container table th {
              background-color: transparent !important;
              color: #000000 !important;
              border-bottom: 2px solid #000000 !important;
              border-top: 2px solid #000000 !important;
              font-weight: 900 !important;
            }
            .print-container table td {
              background-color: transparent !important;
              color: #000000 !important;
              border-bottom: 1px solid #e2e8f0 !important;
            }
          `}</style>
          {/* Visual Header Corner Designs (Branding matching Reference Image) */}
          <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full object-right-top" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0H40L100 60V0Z" fill="#a21caf" />
              <path d="M100 15H70L100 45V15Z" fill="#000000" />
              <path d="M100 30H85L100 45V30Z" fill="#a21caf" />
            </svg>
          </div>

          {/* Contents */}
          <div className="p-10 space-y-4 text-right font-sans" style={{ direction: "rtl" }}>
            {/* Top Branding Section */}
            <div className="flex items-start justify-between flex-wrap gap-4 pt-4">
              <div className="bg-white rounded-xl border shadow-sm flex items-center justify-center h-16 w-16 p-2">
                <img src={logoSrc} alt="Orient Digital" className="h-full w-full object-contain" />
              </div>
              <div className={lang === "ar" ? "text-left" : "text-right"}>
                <div className="text-2xl font-black text-purple-705">
                  {lang === "ar" ? "قسيمة راتب" : "PAYSLIP STATEMENT"}
                </div>
                <div className="text-sm font-bold text-neutral-500" dir="ltr">
                  EMP-{p.employee_id.substring(0, 8).toUpperCase()}-{payrollYear}{payrollMonth}
                </div>
              </div>
            </div>

            {/* Title Section (Matching Profit Invoice style) */}
            <div className="pt-4 border-b pb-2">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
                <div className="space-y-1">
                  <span className="text-black uppercase text-[10px] block font-extrabold">
                    {lang === "ar" ? "مفوتر إلى:" : "BILLED TO:"}
                  </span>
                  <span className="font-extrabold text-black text-sm">
                    {p.employees?.name}
                  </span>
                  <span className="block text-[10px] text-neutral-500">
                    {lang === "ar" ? `الوظيفة: ${p.employees?.job_title}` : `Job Title: ${p.employees?.job_title}`}
                  </span>
                </div>

                <div className="space-y-1 sm:text-left print:text-left">
                  <span className="text-black uppercase text-[10px] block font-extrabold">
                    {lang === "ar" ? "التاريخ:" : "DATE:"}
                  </span>
                  <span className="font-bold text-black block" dir="ltr">
                    {p.payment_date || `${payrollYear}-${payrollMonth}-28`}
                  </span>
                  <span className="text-black uppercase text-[10px] block font-extrabold mt-1">
                    {lang === "ar" ? "تاريخ الاستحقاق:" : "DUE DATE:"}
                  </span>
                  <span className="font-bold text-amber-500 block" dir="ltr">
                    {p.payment_date || `${payrollYear}-${payrollMonth}-30`}
                  </span>
                </div>
              </div>
            </div>

            {/* Simple Table (Matching Invoice Style) */}
            <div className="pt-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-y-2 border-slate-900 text-slate-950 font-black">
                    <th className="text-right p-2.5">{lang === "ar" ? "الوصف" : "DESCRIPTION"}</th>
                    <th className="text-center p-2.5">{lang === "ar" ? "التفاصيل" : "DETAILS"}</th>
                    <th className="text-left p-2.5">{lang === "ar" ? "المبلغ" : "AMOUNT"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="border-b">
                    <td className="p-2.5 font-medium text-black">
                      {lang === "ar" ? "الراتب الأساسي" : "Basic Salary"}
                    </td>
                    <td className="p-2.5 text-center text-neutral-500">
                      {lang === "ar" ? "الراتب الأساسي" : "Contractual base salary"}
                    </td>
                    <td className="p-2.5 text-left font-bold text-black" dir="ltr">
                      {egp(p.salary)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2.5 font-medium text-black">
                      {lang === "ar" ? "الحضور والغياب" : "Attendance"}
                    </td>
                    <td className="p-2.5 text-center text-neutral-500">
                      {lang === "ar"
                        ? "حضور " + p.attendance_days + " يوم | غياب " + p.absence_days + " يوم"
                        : "Attended " + p.attendance_days + " days | Absent " + p.absence_days + " days"}
                    </td>
                    <td className="p-2.5 text-left font-bold text-neutral-400">—</td>
                  </tr>
                  {p.absence_days > 0 && (
                    <tr className="border-b">
                      <td className="p-2.5 font-medium text-red-600">
                        {lang === "ar" ? "خصم الغياب" : "Absence Deduction"}
                      </td>
                      <td className="p-2.5 text-center text-neutral-500 text-xs">
                        {lang === "ar"
                          ? `خصم ${p.absence_days} أيام غياب (يوم الراتب = ${egp(Math.round((p.salary / 30) * 100) / 100)})`
                          : `Deduction for ${p.absence_days} absent days (daily rate = ${egp(Math.round((p.salary / 30) * 100) / 100)})`}
                      </td>
                      <td className="p-2.5 text-left font-bold text-red-600" dir="ltr">
                        -{egp(Math.round((p.absence_days * (p.salary / 30)) * 100) / 100)}
                      </td>
                    </tr>
                  )}
                  {p.bonuses > 0 && (
                    <tr className="border-b">
                      <td className="p-2.5 font-medium text-emerald-600">
                        {lang === "ar" ? "المكافآت والبدلات" : "Bonuses & Allowances"}
                      </td>
                      <td className="p-2.5 text-center text-neutral-500">
                        {p.notes || (lang === "ar" ? "حوافز ومكافآت أداء" : "Performance incentive")}
                      </td>
                      <td className="p-2.5 text-left font-bold text-emerald-600" dir="ltr">
                        +{egp(p.bonuses)}
                      </td>
                    </tr>
                  )}
                  {p.deductions > 0 && (
                    <tr className="border-b">
                      <td className="p-2.5 font-medium text-red-650">
                        {lang === "ar" ? "الخصومات والاستقطاعات" : "Deductions"}
                      </td>
                      <td className="p-2.5 text-center text-neutral-500">
                        {lang === "ar" ? "خصم غياب أو جزاءات إدارية" : "Absence or administrative penalty"}
                      </td>
                      <td className="p-2.5 text-left font-bold text-red-600" dir="ltr">
                        -{egp(p.deductions)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Section (Matching Invoice Style) */}
            <div className="flex flex-col items-end pt-4 space-y-1">
              <div className="w-full sm:w-64 space-y-1 text-xs">
                <div className="flex justify-between border-b pb-1">
                  <span className="text-neutral-500">{lang === "ar" ? "المجموع الفرعي:" : "Subtotal:"}</span>
                  <span className="font-bold text-black" dir="ltr">{egp(p.salary)}</span>
                </div>
                {p.bonuses > 0 && (
                  <div className="flex justify-between border-b pb-1 text-neutral-500">
                    <span>{lang === "ar" ? "المكافآت والبدلات:" : "Bonuses:"}</span>
                    <span className="text-emerald-600 font-bold" dir="ltr">+{egp(p.bonuses)}</span>
                  </div>
                )}
                {p.absence_days > 0 && (
                  <div className="flex justify-between border-b pb-1 text-neutral-500">
                    <span>{lang === "ar" ? "خصم الغياب:" : "Absence Deduction:"}</span>
                    <span className="text-red-650 font-bold" dir="ltr">-{egp(Math.round((p.absence_days * (p.salary / 30)) * 100) / 100)}</span>
                  </div>
                )}
                {p.deductions > 0 && (
                  <div className="flex justify-between border-b pb-1 text-neutral-500">
                    <span>{lang === "ar" ? "الخصومات والاستقطاعات:" : "Deductions:"}</span>
                    <span className="text-red-650 font-bold" dir="ltr">-{egp(p.deductions)}</span>
                  </div>
                )}
                <div className="flex justify-between border-b pb-1 text-black font-extrabold">
                  <span>{lang === "ar" ? "الإجمالي:" : "Grand Total:"}</span>
                  <span dir="ltr">{egp(p.net_pay)}</span>
                </div>
                <div className="flex justify-between border-b pb-1 text-neutral-500">
                  <span>{lang === "ar" ? "المبلغ المدفوع:" : "Amount Paid:"}</span>
                  <span dir="ltr">{egp(paidAmt)}</span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-black text-purple-700">
                  <span>{lang === "ar" ? "الرصيد المتبقي:" : "Remaining Balance:"}</span>
                  <span dir="ltr">{egp(remainingAmt)}</span>
                </div>
              </div>
            </div>

            {/* Signatures block at the bottom */}
            <div className="flex justify-between items-center mt-8 px-4 text-[10px]">
              <div className="space-y-4">
                <p className="font-bold text-slate-700">
                  {lang === "ar" ? "توقيع المستلم (الموظف):" : "Employee Signature:"}
                </p>
                <div className="border-b border-dashed border-slate-400 w-36 pt-2"></div>
              </div>
              <div className="space-y-4 text-left">
                <p className="font-bold text-slate-700">
                  {lang === "ar" ? "توقيع المسؤول المالي والإداري:" : "Management Signature:"}
                </p>
                <div className="border-b border-dashed border-slate-400 w-36 pt-2"></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }, [printType, printTargetPayroll, payrolls, payrollYear, payrollMonth, settings, lang]);

  // If not admin, redirect or show not authorized
  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-6 bg-slate-900 border border-slate-800 rounded-xl max-w-md">
          <h2 className="text-xl font-bold text-destructive mb-2">غير مصرح لك بالدخول</h2>
          <p className="text-muted-foreground text-sm">هذه الصفحة مخصصة لمدير النظام (Admin) فقط ولا يمكن للموظفين العاديين الوصول إليها.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Printable Wrapper Injection */}
      {printableArea}

      <div className="print:hidden space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 text-white">
            <Briefcase className="w-8 h-8 text-primary animate-pulse" />
            {lang === "ar" ? "شؤون الموظفين والرواتب" : "Employees & Payroll"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {lang === "ar"
              ? "إدارة بيانات الموظفين، نسب الحضور، الخصومات والمكافآت ومسيرات الرواتب"
              : "Manage employee directories, attendance, bonuses, payroll tracking and payout slips"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="payroll" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 p-1 mb-4">
          <TabsTrigger value="payroll" className="data-[state=active]:bg-primary">
            {t("monthlyPayrollTitle")}
          </TabsTrigger>
          <TabsTrigger value="directory" className="data-[state=active]:bg-primary">
            {lang === "ar" ? "قائمة الموظفين" : "Employee Directory"}
          </TabsTrigger>
        </TabsList>

        {/* 1. Monthly Payroll Tab */}
        <TabsContent value="payroll" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2.5 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={lang === "ar" ? "بحث عن موظف..." : "Search employee..."}
                  value={payrollSearch}
                  onChange={(e) => setPayrollSearch(e.target.value)}
                  className="search-input-padding"
                />
              </div>

              {/* Year Select */}
              <Select value={payrollYear} onValueChange={setPayrollYear}>
                <SelectTrigger className="w-28 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-white">
                  {["2025", "2026", "2027", "2028"].map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Month Select */}
              <Select value={payrollMonth} onValueChange={setPayrollMonth}>
                <SelectTrigger className="w-36 bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-white">
                  {Array.from({ length: 12 }, (_, i) =>
                    (i + 1).toString().padStart(2, "0")
                  ).map((m) => (
                    <SelectItem key={m} value={m}>
                      {lang === "ar" ? t("months")[Number(m) - 1] : m} ({m})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={triggerPrintSheet}
                disabled={payrolls.length === 0}
                className="border-slate-800 text-white hover:bg-slate-900 bg-slate-950 gap-2"
              >
                <Printer className="w-4 h-4" />
                {t("printPayrollSheet")}
              </Button>
              <Button onClick={() => generatePayrollMut.mutate()} className="gap-2">
                <Calendar className="w-4 h-4" />
                {t("generatePayroll")}
              </Button>

              {payrolls.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="gap-2 border border-red-800 bg-red-950/20 hover:bg-red-950/55 text-red-400">
                      <Trash2 className="w-4 h-4" />
                      {lang === "ar" ? "مسح مسير الرواتب" : "Clear Payroll"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-950 border border-slate-800 text-slate-100 text-right" dir="rtl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white text-right font-bold">
                        {lang === "ar" ? "هل أنت متأكد من مسح مسير الرواتب؟" : "Confirm Clearing Payroll"}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400 text-right">
                        {lang === "ar"
                          ? "سيؤدي هذا الإجراء إلى مسح كافة سجلات الرواتب المنشأة لهذا الشهر بالكامل بشكل نهائي. لا يمكن التراجع عن هذا الإجراء."
                          : "This action will permanently delete all payroll records generated for this month. This cannot be undone."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                      <AlertDialogCancel className="border-slate-700 text-white bg-transparent hover:bg-slate-800">
                        {t("cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => deletePayrollMonthMut.mutate()}
                      >
                        {t("delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          {/* KPI Summary Indicators Cards (Matching Reference Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-4">
            {/* 1. Total Net Due (إجمالي مسير الرواتب) */}
            <div className="bg-slate-950/90 border border-purple-900/50 hover:border-purple-500/60 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.01] relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-purple-300/90 tracking-wider">
                  {lang === "ar" ? "إجمالي مسير الرواتب" : "Total Net Payroll"}
                </span>
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-purple-400 tracking-tight" dir="ltr">
                  {egp(payrollStats.totalNet)}
                </div>
                <p className="text-[11px] font-semibold text-slate-400 mt-2 flex items-center justify-between border-t border-slate-900/80 pt-2">
                  <span>{lang === "ar" ? "المستحقات الكلية لكافة الموظفين" : "Total net payable to all employees"}</span>
                  <span className="text-purple-400 font-extrabold">({payrolls.length} {lang === "ar" ? "موظف" : "emp"})</span>
                </p>
              </div>
            </div>

            {/* 2. Total Paid (الرواتب المدفوعة) */}
            <div className="bg-slate-950/90 border border-amber-900/50 hover:border-amber-500/60 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.01] relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-amber-300/90 tracking-wider">
                  {lang === "ar" ? "الرواتب المدفوعة" : "Paid Salaries"}
                </span>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight" dir="ltr">
                  {egp(payrollStats.totalPaid)}
                </div>
                <p className="text-[11px] font-semibold text-slate-400 mt-2 flex items-center justify-between border-t border-slate-900/80 pt-2">
                  <span>{lang === "ar" ? "المبالغ التي تم تحويلها وصرفها" : "Total amount paid to employees"}</span>
                  <span className="text-amber-400 font-extrabold">({payrollStats.paidCount} {lang === "ar" ? "مسدد" : "paid"})</span>
                </p>
              </div>
            </div>

            {/* 3. Total Pending / Unpaid (الرواتب المعلقة / غير المدفوعة) */}
            <div className="bg-slate-950/90 border border-rose-900/50 hover:border-rose-500/60 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.01] relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-rose-300/90 tracking-wider">
                  {lang === "ar" ? "الرواتب المعلقة" : "Pending Salaries"}
                </span>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 group-hover:bg-rose-500/20 transition-colors">
                  <ShieldAlert className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-rose-400 tracking-tight" dir="ltr">
                  {egp(payrollStats.totalPending)}
                </div>
                <p className="text-[11px] font-semibold text-slate-400 mt-2 flex items-center justify-between border-t border-slate-900/80 pt-2">
                  <span>{lang === "ar" ? "الرواتب المتبقية في انتظار الصرف" : "Remaining balance under processing"}</span>
                  <span className="text-rose-400 font-extrabold">({payrollStats.pendingCount} {lang === "ar" ? "معلق" : "pending"})</span>
                </p>
              </div>
            </div>

            {/* 4. Total Basic & Deductions (إجمالي العقود الأساسية والخصومات والمكافآت) */}
            <div className="bg-slate-950/90 border border-cyan-900/50 hover:border-cyan-500/60 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.01] relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-cyan-300/90 tracking-wider">
                  {lang === "ar" ? "إجمالي العقود الأساسية" : "Total Contract Salaries"}
                </span>
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-cyan-400 tracking-tight" dir="ltr">
                  {egp(payrollStats.totalBasic)}
                </div>
                <p className="text-[11px] font-semibold text-slate-400 mt-2 flex items-center justify-between border-t border-slate-900/80 pt-2">
                  <span>{lang === "ar" ? "خصومات:" : "Ded:"} <strong className="text-rose-400 font-bold" dir="ltr">-{egp(payrollStats.totalDeductions)}</strong></span>
                  <span>{lang === "ar" ? "مكافآت:" : "Bon:"} <strong className="text-emerald-400 font-bold" dir="ltr">+{egp(payrollStats.totalBonuses)}</strong></span>
                </p>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === "ar" ? "الموظف" : "Employee"}</TableHead>
                    <TableHead className="text-right">{t("jobTitle")}</TableHead>
                    <TableHead className="text-right">{t("basicSalary")}</TableHead>
                    <TableHead className="text-center">{t("attendanceDays")}</TableHead>
                    <TableHead className="text-center">{t("absenceDays")}</TableHead>
                    <TableHead className="text-left text-destructive">{t("deductions")}</TableHead>
                    <TableHead className="text-left text-emerald-600">{t("bonuses")}</TableHead>
                    <TableHead className="text-left font-bold">{t("netPay")}</TableHead>
                    <TableHead className="text-right">{t("status")}</TableHead>
                    <TableHead className="text-left">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingPayroll && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        {t("loading")}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingPayroll && filteredPayrolls.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        {lang === "ar"
                          ? "لا توجد سجلات رواتب منشأة لهذا الشهر. اضغط على 'توليد مسير الرواتب' للبدء."
                          : "No payroll records generated for this month yet. Click 'Generate Payroll' to start."}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingPayroll &&
                    filteredPayrolls.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold text-right text-white">
                          {p.employees?.name}
                        </TableCell>
                        <TableCell className="text-right">{p.employees?.job_title}</TableCell>
                        <TableCell dir="ltr" className="text-right">
                          {egp(p.salary)}
                        </TableCell>
                        <TableCell className="text-center">{p.attendance_days}</TableCell>
                        <TableCell className="text-center">{p.absence_days}</TableCell>
                        <TableCell dir="ltr" className="text-left text-red-400 font-medium">
                          -{egp(p.deductions + Math.round((p.absence_days * (p.salary / 30)) * 100) / 100)}
                        </TableCell>
                        <TableCell dir="ltr" className="text-left text-emerald-400 font-medium">
                          +{egp(p.bonuses)}
                        </TableCell>
                        <TableCell dir="ltr" className="text-left font-bold text-indigo-400">
                          {egp(p.net_pay)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              p.status === "paid"
                                ? "bg-emerald-600/20 text-emerald-400"
                                : "bg-amber-600/20 text-amber-400"
                            }`}
                          >
                            {p.status === "paid"
                              ? lang === "ar"
                                ? "مدفوع"
                                : "Paid"
                              : lang === "ar"
                              ? "مسودة"
                              : "Draft"}
                          </span>
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => triggerPrintPayslip(p)}
                              title={t("printPayslip")}
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenEditPayroll(p)}
                            >
                              <Pencil className="w-4 h-4 text-slate-300 hover:text-white" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Employee Directory Tab */}
        <TabsContent value="directory" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={lang === "ar" ? "بحث باسم الموظف..." : "Search by employee..."}
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="search-input-padding"
              />
            </div>
            <Button onClick={handleOpenAddEmployee} className="gap-2">
              <Plus className="w-4 h-4" />
              {t("newEmployee")}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === "ar" ? "الاسم" : "Name"}</TableHead>
                    <TableHead className="text-right">{t("jobTitle")}</TableHead>
                    <TableHead className="text-right">{t("basicSalary")}</TableHead>
                    <TableHead className="text-right">{lang === "ar" ? "الهاتف" : "Phone"}</TableHead>
                    <TableHead className="text-right">{t("notes")}</TableHead>
                    <TableHead className="text-left">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingEmployees && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t("loading")}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingEmployees && filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        {t("noData")}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingEmployees &&
                    filteredEmployees.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-bold text-right text-white">
                          {e.name}
                        </TableCell>
                        <TableCell className="text-right">{e.job_title}</TableCell>
                        <TableCell dir="ltr" className="text-right text-indigo-400 font-bold">
                          {egp(e.salary)}
                        </TableCell>
                        <TableCell className="text-right" dir="ltr">
                          {e.phone || "—"}
                        </TableCell>
                        <TableCell className="text-right max-w-xs truncate text-muted-foreground">
                          {e.notes || "—"}
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenEditEmployee(e)}
                            >
                              <Pencil className="w-4 h-4 text-slate-300 hover:text-white" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteEmployeeId(e.id)}
                            >
                              <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400 transition-colors" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* dialogs */}
      {/* 1. Employee Edit/Add Dialog */}
      <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100 text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-white text-right font-bold">
              {editingEmployee ? t("editEmployee") : t("newEmployee")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-slate-300">{lang === "ar" ? "الاسم كامل *" : "Full Name *"}</Label>
              <Input
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">{t("jobTitle")} *</Label>
              <Input
                value={employeeForm.job_title}
                onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })}
                placeholder={lang === "ar" ? "مثال: مراجع حسابات، ناشر محتوى..." : "e.g. Content Publisher"}
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">{lang === "ar" ? "الراتب الأساسي (ج.م) *" : "Basic Salary (EGP) *"}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={employeeForm.salary}
                onChange={(e) => setEmployeeForm({ ...employeeForm, salary: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white text-left font-bold"
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">{lang === "ar" ? "رقم الهاتف" : "Phone Number"}</Label>
              <Input
                value={employeeForm.phone}
                onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white text-left"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">{lang === "ar" ? "ملاحظات إضافية" : "Additional Notes"}</Label>
              <Textarea
                value={employeeForm.notes}
                onChange={(e) => setEmployeeForm({ ...employeeForm, notes: e.target.value })}
                className="bg-slate-900 border-slate-700 text-white resize-none h-20"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEmployeeDialogOpen(false)}
              className="border-slate-700 text-white bg-transparent"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => saveEmployeeMut.mutate()}
              disabled={saveEmployeeMut.isPending || !employeeForm.name || !employeeForm.job_title || !employeeForm.salary}
            >
              {saveEmployeeMut.isPending ? t("loading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Payroll Edit Dialog */}
      <Dialog open={payrollDialogOpen} onOpenChange={setPayrollDialogOpen}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100 text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-white text-right font-bold">
              {lang === "ar" ? "تعديل سجل الراتب" : "Edit Payroll Record"}
            </DialogTitle>
          </DialogHeader>
          {editingPayroll && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                <div className="text-xs text-muted-foreground">{lang === "ar" ? "بيانات الموظف:" : "Employee:"}</div>
                <div className="font-bold text-white text-sm">{editingPayroll.employees?.name}</div>
                <div className="text-xs text-slate-400">{editingPayroll.employees?.job_title}</div>
                <div className="text-xs text-indigo-400 font-bold mt-1">
                  {lang === "ar" ? "الراتب الأساسي: " : "Basic Salary: "}
                  {egp(editingPayroll.salary)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">{t("attendanceDays")}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="31"
                    value={payrollForm.attendance_days}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPayrollForm({
                        ...payrollForm,
                        attendance_days: val,
                        absence_days: Math.max(0, 30 - val)
                      });
                    }}
                    className="bg-slate-900 border-slate-700 text-white text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">{t("absenceDays")}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="31"
                    value={payrollForm.absence_days}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPayrollForm({
                        ...payrollForm,
                        absence_days: val,
                        attendance_days: Math.max(0, 30 - val)
                      });
                    }}
                    className="bg-slate-900 border-slate-700 text-white text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-red-400">{t("deductions")} (ج.م)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payrollForm.deductions}
                    onChange={(e) =>
                      setPayrollForm({ ...payrollForm, deductions: Number(e.target.value) })
                    }
                    className="bg-slate-900 border-slate-700 text-white text-left font-bold"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-emerald-400">{t("bonuses")} (ج.م)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payrollForm.bonuses}
                    onChange={(e) =>
                      setPayrollForm({ ...payrollForm, bonuses: Number(e.target.value) })
                    }
                    className="bg-slate-900 border-slate-700 text-white text-left font-bold"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">{t("status")}</Label>
                <Select
                  value={payrollForm.status}
                  onValueChange={(val: "draft" | "paid") =>
                    setPayrollForm({ ...payrollForm, status: val })
                  }
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white">
                    <SelectItem value="draft">{lang === "ar" ? "مسودة" : "Draft"}</SelectItem>
                    <SelectItem value="paid">{lang === "ar" ? "مدفوع" : "Paid"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">{t("notes")}</Label>
                <Input
                  value={payrollForm.notes}
                  onChange={(e) => setPayrollForm({ ...payrollForm, notes: e.target.value })}
                  placeholder={lang === "ar" ? "أي ملاحظات للرواتب..." : "Notes..."}
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="flex justify-between items-center text-sm font-bold bg-slate-900/50 p-3 rounded-lg border border-slate-800 mt-2">
                <span className="text-slate-300">{lang === "ar" ? "صافي المستحق (تلقائي):" : "Calculated Net Due:"}</span>
                <span className="text-indigo-400 text-base" dir="ltr">
                  {egp(Math.max(0, Math.round((editingPayroll.salary - payrollForm.deductions + payrollForm.bonuses - (payrollForm.absence_days * (editingPayroll.salary / 30))) * 100) / 100))}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPayrollDialogOpen(false)}
              className="border-slate-700 text-white bg-transparent"
            >
              {t("cancel")}
            </Button>
            <Button onClick={() => savePayrollMut.mutate()} disabled={savePayrollMut.isPending}>
              {savePayrollMut.isPending ? t("loading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteEmployeeId} onOpenChange={(o) => !o && setDeleteEmployeeId(null)}>
        <AlertDialogContent className="bg-slate-900 border border-slate-800 text-slate-100 text-right" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-right font-bold">
              {lang === "ar" ? "هل أنت متأكد من الحذف؟" : "Confirm Employee Deletion"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              {lang === "ar"
                ? "سيؤدي هذا الإجراء إلى حذف الموظف بشكل نهائي وكافة مسجلات الرواتب الشهرية المرتبطة به. لا يمكن التراجع عن هذا الإجراء."
                : "This action will permanently delete the employee record and all associated monthly payroll sheets. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-slate-700 text-white bg-transparent hover:bg-slate-800">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteEmployeeId && deleteEmployeeMut.mutate(deleteEmployeeId)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}

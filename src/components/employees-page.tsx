import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, Plus, Pencil, Trash2, Search, Printer, FileText, Calendar, DollarSign } from "lucide-react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/use-language";
import { money } from "@/lib/format";

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

      // Calculation: Basic Salary - Deductions + Bonuses
      const calculatedNet = salary - ded + bon;

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
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const triggerPrintPayslip = (pay: Payroll) => {
    setPrintType("payslip");
    setPrintTargetPayroll(pay);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Render Printable Elements (Only visible on @media print)
  const printableArea = useMemo(() => {
    if (!printType) return null;

    if (printType === "sheet") {
      const totalBasic = payrolls.reduce((sum, p) => sum + p.salary, 0);
      const totalDeductions = payrolls.reduce((sum, p) => sum + p.deductions, 0);
      const totalBonuses = payrolls.reduce((sum, p) => sum + p.bonuses, 0);
      const totalNet = payrolls.reduce((sum, p) => sum + p.net_pay, 0);

      return (
        <div className="hidden print:block w-full p-8 bg-white text-black font-sans relative min-h-[297mm] pb-24" style={{ direction: "rtl" }}>
          {/* SVG Header corner decoration */}
          <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full object-right-top" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0H40L100 60V0Z" fill="#a21caf" />
              <path d="M100 15H70L100 45V15Z" fill="#000000" />
              <path d="M100 30H85L100 45V30Z" fill="#a21caf" />
            </svg>
          </div>

          <div className="flex items-start justify-between border-b pb-6 mb-8 pt-4">
            <div className="bg-white p-2 border rounded-xl shadow-sm">
              <img src="/logo.png" alt="Orient Digital" className="h-14 w-auto object-contain" />
            </div>
            <div className="text-right pl-12">
              <h1 className="text-2xl font-black text-purple-700">كشف مسير الرواتب الشهري المجمع</h1>
              <p className="text-sm text-neutral-500 font-bold mt-1" dir="ltr">
                Orient Digital - Period: {payrollYear} / {payrollMonth}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <table className="w-full border-collapse text-sm text-right">
              <thead>
                <tr className="border-y-2 border-slate-900 text-slate-950 font-black bg-slate-50">
                  <th className="p-3">الموظف</th>
                  <th className="p-3">الوظيفة</th>
                  <th className="p-3 text-left">الراتب الأساسي</th>
                  <th className="p-3 text-center">الحضور (يوم)</th>
                  <th className="p-3 text-center">الغياب (يوم)</th>
                  <th className="p-3 text-left text-red-650">الخصومات</th>
                  <th className="p-3 text-left text-emerald-650">المكافآت</th>
                  <th className="p-3 text-left font-bold">صافي المستحق</th>
                  <th className="p-3 w-44 text-center">إمضاء الموظف بالاستلام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payrolls.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-900">{p.employees?.name}</td>
                    <td className="p-3 text-slate-600">{p.employees?.job_title}</td>
                    <td className="p-3 text-left font-semibold" dir="ltr">${p.salary.toFixed(2)}</td>
                    <td className="p-3 text-center font-mono">{p.attendance_days}</td>
                    <td className="p-3 text-center font-mono">{p.absence_days}</td>
                    <td className="p-3 text-left text-red-600 font-semibold" dir="ltr">-${p.deductions.toFixed(2)}</td>
                    <td className="p-3 text-left text-emerald-600 font-semibold" dir="ltr">+${p.bonuses.toFixed(2)}</td>
                    <td className="p-3 text-left font-black text-purple-700" dir="ltr">${p.net_pay.toFixed(2)}</td>
                    <td className="p-3 text-center text-slate-300 text-xs border-r border-slate-200">توقيع: .....................</td>
                  </tr>
                ))}
                {/* Summary Row */}
                <tr className="border-t-2 border-slate-900 font-black bg-slate-50">
                  <td className="p-3 text-right" colSpan={2}>الإجمالي النهائي (Total):</td>
                  <td className="p-3 text-left text-black" dir="ltr">${totalBasic.toFixed(2)}</td>
                  <td className="p-3" colSpan={2}></td>
                  <td className="p-3 text-left text-red-600" dir="ltr">-${totalDeductions.toFixed(2)}</td>
                  <td className="p-3 text-left text-emerald-600" dir="ltr">+${totalBonuses.toFixed(2)}</td>
                  <td className="p-3 text-left text-purple-705 font-black" dir="ltr">${totalNet.toFixed(2)}</td>
                  <td className="p-3"></td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-8 pt-16">
              <div className="space-y-8">
                <p className="text-sm font-bold text-slate-700">المسؤول المالي (Finance):</p>
                <div className="border-b border-dashed border-slate-400 w-48 h-8"></div>
              </div>
              <div className="space-y-8 text-left justify-self-end">
                <p className="text-sm font-bold text-slate-700">اعتماد المدير العام (CEO Approval):</p>
                <div className="border-b border-dashed border-slate-400 w-48 h-8"></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (printType === "payslip" && printTargetPayroll) {
      const p = printTargetPayroll;
      return (
        <div className="hidden print:block w-full p-12 bg-white text-black font-sans relative min-h-[297mm] pb-24" style={{ direction: "rtl" }}>
          {/* SVG Header corner decoration */}
          <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full object-right-top" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0H40L100 60V0Z" fill="#a21caf" />
              <path d="M100 15H70L100 45V15Z" fill="#000000" />
              <path d="M100 30H85L100 45V30Z" fill="#a21caf" />
            </svg>
          </div>

          {/* Branding Header */}
          <div className="flex items-start justify-between border-b pb-6 mb-8 pt-4">
            <div className="bg-white p-2 border rounded-xl shadow-sm">
              <img src="/logo.png" alt="Orient Digital" className="h-14 w-auto object-contain" />
            </div>
            <div className="text-right pl-12">
              <h1 className="text-2xl font-black text-purple-750">كشف راتب موظف تفصيلي</h1>
              <p className="text-sm text-neutral-500 font-bold mt-1" dir="ltr">
                PAYSLIP STATEMENT
              </p>
            </div>
          </div>

          {/* Employee Profile Details */}
          <div className="pt-4 border-b pb-6">
            <h2 className="text-xl font-black text-purple-705 mb-4">بيانات الموظف / EMPLOYEE DETAILS</h2>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div className="space-y-2">
                <div>
                  <span className="text-neutral-500 font-bold block text-xs">اسم الموظف / NAME:</span>
                  <span className="font-black text-slate-900 text-base">{p.employees?.name}</span>
                </div>
                <div>
                  <span className="text-neutral-500 font-bold block text-xs">الوظيفة / JOB TITLE:</span>
                  <span className="font-semibold text-slate-800">{p.employees?.job_title}</span>
                </div>
              </div>
              <div className="space-y-2 text-left">
                <div>
                  <span className="text-neutral-500 font-bold block text-xs">فترة الراتب / PERIOD:</span>
                  <span className="font-bold text-slate-900" dir="ltr">{payrollYear} / {payrollMonth}</span>
                </div>
                {p.payment_date && (
                  <div>
                    <span className="text-neutral-500 font-bold block text-xs">تاريخ الصرف / PAY DATE:</span>
                    <span className="font-bold text-slate-900" dir="ltr">{p.payment_date}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Detailed Statement Table */}
          <div className="pt-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-y-2 border-slate-900 text-slate-950 font-black bg-slate-50">
                  <th className="text-right p-3">البند / PAYROLL ITEM</th>
                  <th className="text-center p-3">التفاصيل / DETAILS</th>
                  <th className="text-left p-3">القيمة / AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 font-semibold text-black">الراتب الأساسي / Basic Salary</td>
                  <td className="p-3 text-center text-neutral-500">الراتب المتفق عليه في العقد</td>
                  <td className="p-3 text-left font-bold" dir="ltr">${p.salary.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-black">الحضور والغياب / Attendance</td>
                  <td className="p-3 text-center text-neutral-500">حضور {p.attendance_days} يوم | غياب {p.absence_days} يوم</td>
                  <td className="p-3 text-left font-bold text-neutral-400">—</td>
                </tr>
                {p.bonuses > 0 && (
                  <tr>
                    <td className="p-3 font-semibold text-emerald-600">المكافآت والبدلات / Bonuses & Allowances</td>
                    <td className="p-3 text-center text-neutral-500">{p.notes || "مكافأة أداء / حوافز إضافية"}</td>
                    <td className="p-3 text-left font-bold text-emerald-600" dir="ltr">+${p.bonuses.toFixed(2)}</td>
                  </tr>
                )}
                {p.deductions > 0 && (
                  <tr>
                    <td className="p-3 font-semibold text-red-650">الخصومات والاستقطاعات / Deductions</td>
                    <td className="p-3 text-center text-neutral-500">خصومات غياب أو جزاءات</td>
                    <td className="p-3 text-left font-bold text-red-600" dir="ltr">-${p.deductions.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pt-4 border-t">
            <div>
              {p.notes && (
                <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                  <span className="font-bold text-slate-700 block">ملاحظات الصرف:</span>
                  <span className="text-slate-600">{p.notes}</span>
                </div>
              )}
            </div>
            
            {/* Totals Summary */}
            <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between border-b pb-1">
                <span>الراتب الأساسي:</span>
                <span className="font-bold text-slate-900" dir="ltr">${p.salary.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b pb-1 text-emerald-600 font-semibold">
                <span>المكافآت والبدلات (+):</span>
                <span dir="ltr">+${p.bonuses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b pb-1 text-red-600 font-semibold">
                <span>الخصومات (-):</span>
                <span dir="ltr">-${p.deductions.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-1 text-purple-700">
                <span>صافي الراتب المستحق:</span>
                <span dir="ltr">${p.net_pay.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signatures Footer */}
          <div className="flex justify-between items-center mt-20 px-4 text-sm">
            <div className="space-y-12">
              <p className="font-bold text-slate-700">توقيع المستلم (الموظف):</p>
              <div className="border-b border-dashed border-slate-400 w-44"></div>
            </div>
            <div className="space-y-12 text-left">
              <p className="font-bold text-slate-700">توقيع المسؤول المالي والإداري:</p>
              <div className="border-b border-dashed border-slate-400 w-44"></div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }, [printType, printTargetPayroll, payrolls, payrollYear, payrollMonth]);

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
                          {money(p.salary)}
                        </TableCell>
                        <TableCell className="text-center">{p.attendance_days}</TableCell>
                        <TableCell className="text-center">{p.absence_days}</TableCell>
                        <TableCell dir="ltr" className="text-left text-red-400 font-medium">
                          -{money(p.deductions)}
                        </TableCell>
                        <TableCell dir="ltr" className="text-left text-emerald-400 font-medium">
                          +{money(p.bonuses)}
                        </TableCell>
                        <TableCell dir="ltr" className="text-left font-bold text-indigo-400">
                          {money(p.net_pay)}
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
                placeholder={t("searchChannelPlaceholder")}
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
                          {money(e.salary)}
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
              <Label className="text-slate-300">{lang === "ar" ? "الراتب الأساسي (USD) *" : "Basic Salary (USD) *"}</Label>
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
                  {money(editingPayroll.salary)}
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
                    onChange={(e) =>
                      setPayrollForm({ ...payrollForm, attendance_days: Number(e.target.value) })
                    }
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
                    onChange={(e) =>
                      setPayrollForm({ ...payrollForm, absence_days: Number(e.target.value) })
                    }
                    className="bg-slate-900 border-slate-700 text-white text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-red-400">{t("deductions")} ($)</Label>
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
                  <Label className="text-slate-300 text-emerald-400">{t("bonuses")} ($)</Label>
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
                  {money(editingPayroll.salary - payrollForm.deductions + payrollForm.bonuses)}
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

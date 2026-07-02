import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Language = "ar" | "en";

export interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const translations: Record<Language, Record<string, any>> = {
  ar: {
    // Sidebar & Navigation
    dashboard: "لوحة التحكم",
    clients: "العملاء",
    channels: "القنوات",
    publishing: "نشر القنوات",
    revenue: "الإيرادات الشهرية",
    invoices: "الفواتير",
    payments: "المدفوعات",
    statements: "كشوف الحساب",
    reports: "التقارير",
    users: "المستخدمون",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    brandName: "أورينت ديجيتال",

    // Common / Buttons
    save: "حفظ",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    search: "بحث",
    add: "إضافة",
    loading: "جاري التحميل...",
    noData: "لا توجد بيانات",
    actions: "إجراءات",
    history: "السجل",
    close: "إغلاق",
    confirm: "تأكيد",

    // Dashboard
    totalRevenue: "إجمالي الإيرادات",
    clientShare: "حصص العملاء",
    companyShare: "أرباح الشركة",
    collectedPayments: "إجمالي المدفوعات",
    remainingPayments: "إجمالي المتبقي",
    revenueCurve: "منحنى الإيرادات وحصص الأرباح (12 شهر الأخيرة)",
    monthlyRevenuesSummary: "ملخص الإيرادات الشهرية للشركة",
    activeChannelsCount: "عدد القنوات النشطة",
    clientsCount: "عدد العملاء",
    systemsCount: "عدد سيستم النشر",

    // Channels Page
    channelName: "القناة",
    clientName: "العميل",
    systemName: "السيستم",
    clientPercent: "نسبة العميل",
    systemPercent: "نسبة السيستم",
    companyPercent: "نسبة الشركة",
    monetization: "تفعيل الأرباح",
    monetized: "مفعلة",
    notMonetized: "غير مفعلة",
    status: "الحالة",
    link: "الرابط",
    newChannel: "قناة جديدة",
    editChannel: "تعديل قناة",
    exportExcel: "تصدير Excel",
    searchChannelPlaceholder: "بحث باسم القناة أو العميل أو السيستم...",
    active: "نشطة",
    paused: "متوقفة مؤقتاً",
    suspended: "موقوفة مؤقتاً",
    closed: "مغلقة",

    // Clients Page
    clientPhone: "الهاتف",
    clientEmail: "البريد",
    clientWalletInstapay: "إنستاباي / محفظة",
    channelsCount: "عدد القنوات",
    newClient: "عميل جديد",
    editClient: "تعديل عميل",
    searchClientPlaceholder: "بحث بالاسم أو البريد أو الهاتف...",
    paymentType: "طريقة التحويل",
    wallet: "محفظة إلكترونية",
    instapay: "إنستاباي",

    // Publishing Page
    assignedStaff: "الموظف",
    notes: "ملاحظات",
    publishingTrackerTitle: "نشر القنوات",
    publishingTrackerDesc: "تتبع مهام النشر الشهرية للقنوات وإسنادها للموظفين",
    importExcel: "استيراد من Excel",
    allStaff: "كل الموظفين",
    myChannelsOnly: "قنواتي فقط",
    unassignedOnly: "غير معينة لموظف",
    allStatus: "كل الحالات",
    allMonetized: "كل قنوات الأرباح",
    yearLabel: "السنة",
    searchPublishingPlaceholder: "بحث باسم القناة أو الموظف أو العميل...",
    months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],

    // Payments Page
    paymentsTitle: "المدفوعات",
    paymentsDesc: "سجل التحويلات والمدفوعات الجزئية وحساب الأرصدة تلقائياً",
    dueAmount: "المستحق",
    paidAmount: "المدفوع",
    remainingAmount: "المتبقي",
    lastTransfer: "آخر تحويل",
    registerPay: "تسجيل دفع",
    clearFilters: "مسح التصفية",
    searchPaymentsPlaceholder: "بحث بالقناة أو العميل...",
    allPaymentsStatus: "حالة الدفع",
    paymentHistory: "سجل المدفوعات",
    prevTransactions: "المعاملات السابقة",
    transactionDate: "التاريخ",
    transferNo: "رقم التحويل",
    deleteTxConfirm: "هل أنت متأكد تماماً من حذف هذه المعاملة؟",
    deleteTxDesc: "هذا الإجراء سيقوم بحذف سجل الدفعة المالية وإلغاء الإيصال التلقائي وتحديث أرصدة الفواتير المتبقية.",
    quickPayTitle: "تسجيل دفعة مالية جديدة",
    quickPayDesc: "تلقائياً مكتوب فيه المتبقي بالكامل للدفع السريع. يمكنك كتابة جزء منه فقط للدفع الجزئي.",
  },
  en: {
    // Sidebar & Navigation
    dashboard: "Dashboard",
    clients: "Clients",
    channels: "Channels",
    publishing: "Publishing",
    revenue: "Monthly Revenue",
    invoices: "Invoices",
    payments: "Payments",
    statements: "Statements",
    reports: "Reports",
    users: "Users",
    settings: "Settings",
    logout: "Log Out",
    brandName: "Orient Digital",

    // Common / Buttons
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    search: "Search",
    add: "Add",
    loading: "Loading...",
    noData: "No Data",
    actions: "Actions",
    history: "History",
    close: "Close",
    confirm: "Confirm",

    // Dashboard
    totalRevenue: "Total Revenue",
    clientShare: "Clients Share",
    companyShare: "Company Share",
    collectedPayments: "Collected Payments",
    remainingPayments: "Remaining Payments",
    revenueCurve: "Revenue & Earnings Shares Curve (Last 12 Months)",
    monthlyRevenuesSummary: "Company Monthly Revenue Summary",
    activeChannelsCount: "Active Channels",
    clientsCount: "Clients Count",
    systemsCount: "Publishing Systems",

    // Channels Page
    channelName: "Channel",
    clientName: "Client",
    systemName: "System",
    clientPercent: "Client %",
    systemPercent: "System %",
    companyPercent: "Company %",
    monetization: "Monetization",
    monetized: "Monetized",
    notMonetized: "Not Monetized",
    status: "Status",
    link: "Link",
    newChannel: "New Channel",
    editChannel: "Edit Channel",
    exportExcel: "Export Excel",
    searchChannelPlaceholder: "Search channel, client, or system...",
    active: "Active",
    paused: "Paused",
    suspended: "Suspended",
    closed: "Closed",

    // Clients Page
    clientPhone: "Phone",
    clientEmail: "Email",
    clientWalletInstapay: "InstaPay / Wallet",
    channelsCount: "Channels Count",
    newClient: "New Client",
    editClient: "Edit Client",
    searchClientPlaceholder: "Search by name, email, or phone...",
    paymentType: "Transfer Method",
    wallet: "E-Wallet",
    instapay: "InstaPay",

    // Publishing Page
    assignedStaff: "Staff",
    notes: "Notes",
    publishingTrackerTitle: "Channel Publishing",
    publishingTrackerDesc: "Track monthly publishing tasks and assign them to staff",
    importExcel: "Import from Excel",
    allStaff: "All Staff",
    myChannelsOnly: "My Channels",
    unassignedOnly: "Unassigned",
    allStatus: "All Statuses",
    allMonetized: "All Monetization Statuses",
    yearLabel: "Year",
    searchPublishingPlaceholder: "Search by channel, staff, or client...",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

    // Payments Page
    paymentsTitle: "Payments",
    paymentsDesc: "Log transfers, partial payments and auto-calculate remaining balances",
    dueAmount: "Due",
    paidAmount: "Paid",
    remainingAmount: "Remaining",
    lastTransfer: "Last Transfer",
    registerPay: "Register Pay",
    clearFilters: "Clear Filters",
    searchPaymentsPlaceholder: "Search by channel or client...",
    allPaymentsStatus: "Payment Status",
    paymentHistory: "Payment History",
    prevTransactions: "Previous Transactions",
    transactionDate: "Date",
    transferNo: "Transfer No",
    deleteTxConfirm: "Are you sure you want to delete this transaction?",
    deleteTxDesc: "This action will delete the payment record and update the remaining invoice balances.",
    quickPayTitle: "Register New Payment",
    quickPayDesc: "Pre-filled with full remaining balance for quick pay. Enter less for partial payment.",
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("ar");

  useEffect(() => {
    const saved = localStorage.getItem("orient_lang");
    if (saved === "ar" || saved === "en") {
      setLangState(saved);
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("orient_lang", newLang);
  };

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
      if (lang === "ar") {
        document.documentElement.classList.add("rtl");
        document.documentElement.classList.remove("ltr");
      } else {
        document.documentElement.classList.add("ltr");
        document.documentElement.classList.remove("rtl");
      }
    }
  }, [lang, dir]);

  const t = (key: string): string => {
    return translations[lang][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

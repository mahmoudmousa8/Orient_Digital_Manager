export function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  const numStr = new Intl.NumberFormat("en-US", { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(v);
  // Prepend \u200E (Left-to-Right Mark) to force $ on the left and space before the number in RTL environments
  return `\u200E$\u00A0${numStr}`;
}

export function monthLabel(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "long" }).format(date);
}

export const STATUS_AR: Record<string, string> = {
  active: "نشطة",
  paused: "متوقفة مؤقتاً",
  suspended: "موقوفة",
  closed: "مغلقة",
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  partial: "مدفوع جزئياً",
  draft: "مسودة",
  issued: "صادرة",
  overdue: "متأخرة",
  cancelled: "ملغاة",
};

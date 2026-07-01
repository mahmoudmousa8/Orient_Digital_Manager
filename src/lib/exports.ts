import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas-pro";

export type ReportRow = {
  channel: string;
  link: string;
  month: string;
  revenue: number;
  percentage: number;
  clientShare: number;
  companyShare: number;
  paymentStatus: string;
  amountPaid: number;
  remaining: number;
  runningBalance?: number;
};

export function exportExcel(filename: string, clientName: string, rows: ReportRow[]) {
  const data = rows.map((r) => ({
    Channel: r.channel,
    Link: r.link,
    Month: r.month,
    "Revenue ($)": r.revenue,
    "Client %": r.percentage,
    "Client Share ($)": r.clientShare,
    "Company Share ($)": r.companyShare,
    "Payment Status": r.paymentStatus,
    "Amount Paid ($)": r.amountPaid,
    "Remaining ($)": r.remaining,
  }));
  const totals = {
    Channel: "TOTAL", Link: "", Month: "",
    "Revenue ($)": rows.reduce((s, r) => s + r.revenue, 0),
    "Client %": "",
    "Client Share ($)": rows.reduce((s, r) => s + r.clientShare, 0),
    "Company Share ($)": rows.reduce((s, r) => s + r.companyShare, 0),
    "Payment Status": "",
    "Amount Paid ($)": rows.reduce((s, r) => s + r.amountPaid, 0),
    "Remaining ($)": rows.reduce((s, r) => s + r.remaining, 0),
  };
  const ws = XLSX.utils.json_to_sheet([...data, totals]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, clientName.slice(0, 28) || "Report");
  XLSX.writeFile(wb, filename);
}

function brandedHeader(doc: jsPDF, subtitle: string) {
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ORIENT DIGITAL", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("YouTube Channels Management", doc.internal.pageSize.getWidth() - 14, 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(subtitle, 14, 30);
}

function brandedFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Orient Digital  •  orientdigital.com", 14, h - 8);
    doc.text(`Page ${i} / ${pages}`, w - 14, h - 8, { align: "right" });
  }
}

export async function exportPDF(filename: string, clientName: string, period: string, rows: ReportRow[]) {
  const element = document.createElement("div");
  element.style.position = "absolute";
  element.style.left = "-9999px";
  element.style.top = "-9999px";

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalClientShare = rows.reduce((s, r) => s + r.clientShare, 0);
  const totalCompanyShare = rows.reduce((s, r) => s + r.companyShare, 0);
  const totalPaid = rows.reduce((s, r) => s + r.amountPaid, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  const tableRowsHtml = rows.map((r) => `
    <tr style="border-bottom: 1px solid #e2e8f0; color: #334155;">
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #0f172a; text-align: right;">${r.channel}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right;">${r.month}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: 500;">$${r.revenue.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center;">${r.percentage}%</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: 500;">$${r.clientShare.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: 500;">$${r.companyShare.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right;">${r.paymentStatus}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; color: #16a34a; font-weight: 500;">$${r.amountPaid.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; color: #a21caf; font-weight: 500;">$${r.remaining.toFixed(2)}</td>
    </tr>
  `).join("");

  element.innerHTML = `
    <div style="font-family: 'Cairo', 'Segoe UI', sans-serif; direction: rtl; padding: 25px; color: #000; background: #fff; width: 11.2in; box-sizing: border-box; min-height: 7.9in; display: flex; flex-direction: column; justify-content: space-between;">
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
      <div>
        <!-- Header Bar -->
        <div style="background: #a21caf; color: #fff; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; margin-bottom: 20px;">
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px;">ORIENT DIGITAL</div>
          <div style="font-size: 11px;">إدارة قنوات اليوتيوب • YouTube Channels Management</div>
        </div>

        <!-- Title & Period -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #eaeaea; padding-bottom: 12px; margin-bottom: 20px;">
          <div>
            <h1 style="font-size: 24px; font-weight: 900; color: #a21caf; margin: 0;">التقرير المالي الدوري</h1>
            <div style="font-size: 13px; font-weight: bold; color: #666; margin-top: 5px;">الجهة / العميل: <span style="color: #000; font-size: 15px;">${clientName}</span></div>
          </div>
          <div style="text-align: left; font-size: 12px; color: #666;">
            <p style="margin: 2px 0;"><strong>الفترة:</strong> ${period}</p>
            <p style="margin: 2px 0;"><strong>تاريخ الاستخراج:</strong> ${new Date().toLocaleDateString("ar-EG")}</p>
          </div>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #a21caf; color: #fff; font-weight: bold;">
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: right;">القناة</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: right;">الشهر</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">الإيراد</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: center;">نسبة العميل</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">حصة العميل</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">حصة الشركة</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: right;">الحالة</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">المدفوع</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: bold; color: #0f172a;">
              <td style="padding: 10px; border: 1px solid #e2e8f0;" colspan="2">المجموع الإجمالي</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalRevenue.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;"></td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalClientShare.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalCompanyShare.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;"></td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalPaid.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalRemaining.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Footer -->
      <div style="font-size: 9px; color: #94a3b8; text-align: center; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
        Orient Digital • orientdigital.com • تقرير مالي دوري رسمي ومعتمد
      </div>
    </div>
  `;

  document.body.appendChild(element);

  try {
    const canvas = await html2canvas(element, {
      scale: 2.2,
      useCORS: true,
      logging: false,
    });

    const imgWidth = 11.69; // A4 landscape width in inches
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "in",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    pdf.save(filename);
  } catch (err) {
    console.error(err);
  } finally {
    document.body.removeChild(element);
  }
}

export type StatementRow = ReportRow;

export async function exportStatementPDF(filename: string, opts: {
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  vodafoneCash?: string | null;
  period: string;
  rows: StatementRow[];
  openingBalance: number;
  closingBalance: number;
}) {
  const { clientName, clientEmail, clientPhone, vodafoneCash, period, rows, openingBalance, closingBalance } = opts;

  const element = document.createElement("div");
  element.style.position = "absolute";
  element.style.left = "-9999px";
  element.style.top = "-9999px";

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalClientShare = rows.reduce((s, r) => s + r.clientShare, 0);
  const totalPaid = rows.reduce((s, r) => s + r.amountPaid, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  const tableRowsHtml = rows.map((r) => `
    <tr style="border-bottom: 1px solid #e2e8f0; color: #334155;">
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #0f172a; text-align: right;">${r.month} • ${r.channel}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;" dir="ltr">${r.link || "—"}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: 500;">$${r.revenue.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center;">${r.percentage}%</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: 500;">$${r.clientShare.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; color: #16a34a; font-weight: 500;">$${r.amountPaid.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; color: #a21caf; font-weight: 500;">$${r.remaining.toFixed(2)}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: bold; color: #0f172a;">$${r.runningBalance !== undefined ? Number(r.runningBalance).toFixed(2) : ""}</td>
      <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right;">${r.paymentStatus}</td>
    </tr>
  `).join("");

  element.innerHTML = `
    <div style="font-family: 'Cairo', 'Segoe UI', sans-serif; direction: rtl; padding: 25px; color: #000; background: #fff; width: 11.2in; box-sizing: border-box; min-height: 7.9in; display: flex; flex-direction: column; justify-content: space-between;">
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
      <div>
        <!-- Header Bar -->
        <div style="background: #a21caf; color: #fff; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; margin-bottom: 20px;">
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px;">ORIENT DIGITAL</div>
          <div style="font-size: 11px;">إدارة قنوات اليوتيوب • YouTube Channels Management</div>
        </div>

        <!-- Title & Period -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #eaeaea; padding-bottom: 12px; margin-bottom: 20px;">
          <div>
            <h1 style="font-size: 24px; font-weight: 900; color: #a21caf; margin: 0;">كشف حساب عميل تفصيلي</h1>
            <div style="font-size: 13px; font-weight: bold; color: #666; margin-top: 5px;">العميل الشريك: <span style="color: #000; font-size: 15px;">${clientName}</span></div>
          </div>
          <div style="text-align: left; font-size: 12px; color: #666;">
            <p style="margin: 2px 0;"><strong>الفترة:</strong> ${period}</p>
            <p style="margin: 2px 0;"><strong>تاريخ الاستخراج:</strong> ${new Date().toLocaleDateString("ar-EG")}</p>
          </div>
        </div>

        <!-- Client Details Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">الرصيد الافتتاحي (السابق)</div>
            <div style="font-size: 16px; font-weight: bold; color: #0f172a; margin-top: 4px;">$${openingBalance.toFixed(2)}</div>
          </div>
          <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">البريد الإلكتروني</div>
            <div style="font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${clientEmail || "—"}</div>
          </div>
          <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">رقم الهاتف</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 4px;">${clientPhone || "—"}</div>
          </div>
          <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">محفظة فودافون كاش</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 4px;">${vodafoneCash || "—"}</div>
          </div>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #a21caf; color: #fff; font-weight: bold;">
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: right;">الشهر والقناة</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">الرابط</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">إجمالي الأرباح</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: center;">النسبة</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">حصة العميل</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">المدفوع</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">المتبقي</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: left;">الرصيد الجاري</th>
              <th style="padding: 10px; border: 1px solid #a21caf; text-align: right;">الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: bold; color: #0f172a;">
              <td style="padding: 10px; border: 1px solid #e2e8f0;" colspan="2">المجموع الإجمالي للفترة</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalRevenue.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;"></td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalClientShare.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalPaid.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${totalRemaining.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">$${closingBalance.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;"></td>
            </tr>
          </tfoot>
        </table>

        <!-- Final Summary Box -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 15px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div style="font-size: 12px; color: #334155; line-height: 1.6;">
            <p style="margin: 0;"><strong>الرصيد الافتتاحي:</strong> $${openingBalance.toFixed(2)}</p>
            <p style="margin: 0;"><strong>أرباح الفترة (حصة العميل):</strong> $${totalClientShare.toFixed(2)}</p>
            <p style="margin: 0;"><strong>المدفوعات خلال الفترة:</strong> $${totalPaid.toFixed(2)}</p>
          </div>
          <div style="text-align: left;">
            <div style="font-size: 11px; color: #64748b;">الرصيد الختامي المستحق</div>
            <div style="font-size: 22px; font-weight: 900; color: ${closingBalance > 0 ? '#a21caf' : '#16a34a'}; margin-top: 4px;">$${closingBalance.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="font-size: 9px; color: #94a3b8; text-align: center; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
        Orient Digital • orientdigital.com • كشف حساب مالي رسمي ومعتمد
      </div>
    </div>
  `;

  document.body.appendChild(element);

  try {
    const canvas = await html2canvas(element, {
      scale: 2.2,
      useCORS: true,
      logging: false,
    });

    const imgWidth = 11.69; // A4 landscape width in inches
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "in",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    pdf.save(filename);
  } catch (err) {
    console.error(err);
  } finally {
    document.body.removeChild(element);
  }
}

export function parseRevenueFile(file: File): Promise<Array<{ channel: string; month: string; revenue: number; percentage?: number }>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
        const out = rows.map((r) => {
          const channel = String(r.channel ?? r.Channel ?? r["اسم القناة"] ?? r["القناة"] ?? "").trim();
          const monthRaw = String(r.month ?? r.Month ?? r["الشهر"] ?? "").trim();
          const revenue = Number(r.revenue ?? r.Revenue ?? r["الإيراد"] ?? r["إجمالي الإيراد"] ?? 0);
          const percentage = r.percentage ?? r.Percentage ?? r["النسبة"];
          let month = "";
          if (monthRaw) {
            const match = monthRaw.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
            if (match) {
              const y = match[1];
              const m = match[2].padStart(2, '0');
              month = `${y}-${m}-01`;
            } else {
              const d = new Date(monthRaw);
              if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                month = `${y}-${m}-01`;
              }
            }
          }
          return { channel, month, revenue, percentage: percentage !== "" && percentage != null ? Number(percentage) : undefined };
        }).filter((r) => r.channel && r.month && r.revenue > 0);
        resolve(out);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

export function downloadRevenueTemplate(channels?: any[]) {
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
  
  let data = [];
  if (channels && channels.length > 0) {
    // Include all active channels so user can fill revenues manually
    const activeChannels = channels.filter(c => c.status === 'active' || !c.status);
    data = activeChannels.map((c, index) => {
      const rowNum = index + 2; // Row 1 is header, data starts at row 2
      return {
        "الشهر": currentMonth,
        "القناة": c.name,
        "العميل": c.clients?.name ?? "",
        "إجمالي الإيراد": "", // Left empty for user input
        "النسبة": c.client_percentage ?? 50,
        "حصة العميل": { t: "n", f: `ROUND(D${rowNum}*E${rowNum}/100, 2)` },
        "حصة الشركة": { t: "n", f: `ROUND(D${rowNum}*(100-E${rowNum})/100, 2)` }
      };
    });
  }

  // If no active channels, fallback to mock examples
  if (data.length === 0) {
    data = [
      {
        "الشهر": currentMonth,
        "القناة": "قناة تجريبية 1",
        "العميل": "عميل تجريبي 1",
        "إجمالي الإيراد": "",
        "النسبة": 60,
        "حصة العميل": { t: "n", f: "ROUND(D2*E2/100, 2)" },
        "حصة الشركة": { t: "n", f: "ROUND(D2*(100-E2)/100, 2)" }
      },
      {
        "الشهر": currentMonth,
        "القناة": "قناة تجريبية 2",
        "العميل": "عميل تجريبي 2",
        "إجمالي الإيراد": "",
        "النسبة": 65,
        "حصة العميل": { t: "n", f: "ROUND(D3*E3/100, 2)" },
        "حصة الشركة": { t: "n", f: "ROUND(D3*(100-E3)/100, 2)" }
      }
    ];
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Revenues");
  XLSX.writeFile(wb, "revenue-import-template.xlsx");
}

export type InvoicePDFOpts = {
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  remainingBalance: number;
  amountPaid?: number;
  notes?: string | null;
  termsConditions?: string | null;
  companyName: string;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  items: Array<{
    description: string;
    views: number;
    amount: number;
  }>;
  lang?: "ar" | "en";
};

export function exportInvoicePDF(filename: string, opts: InvoicePDFOpts) {
  const {
    invoiceNumber,
    clientName,
    clientEmail,
    clientPhone,
    issueDate,
    dueDate,
    subtotal,
    discountAmount,
    taxAmount,
    grandTotal,
    remainingBalance,
    notes,
    termsConditions,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    items,
    lang = "ar",
  } = opts;

  const doc = new jsPDF({ orientation: "portrait" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // 1. Draw top-right abstract polygons (Reference branding)
  doc.setFillColor(162, 28, 175); // Purple
  doc.triangle(w - 70, 0, w, 0, w, 35, "F");
  doc.setFillColor(0, 0, 0); // Black
  doc.triangle(w - 45, 0, w, 0, w, 22, "F");
  doc.setFillColor(162, 28, 175); // Purple
  doc.triangle(w - 20, 0, w, 0, w, 10, "F");

  // 2. Draw bottom-left abstract polygons
  doc.setFillColor(162, 28, 175); // Purple
  doc.triangle(0, h - 35, 0, h, 60, h, "F");
  doc.setFillColor(0, 0, 0); // Black
  doc.triangle(0, h - 22, 0, h, 40, h, "F");

  // 3. Branded Header text
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(companyName.toUpperCase(), 14, 20);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text("YouTube Channels Management", 14, 24);

  // 4. Large bold title (Matching Attached Reference Image)
  doc.setFontSize(22);
  doc.setTextColor(162, 28, 175);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL PROFITS", 14, 42);

  // 5. Invoice metadata (Billed To, Dates)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`BILLED TO: ${clientName.toUpperCase()}`, 14, 54);
  if (clientEmail) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Email: ${clientEmail}`, 14, 58);
  }
  
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`DATE: ${issueDate}`, 14, 66);
  doc.text(`DUE DATE: ${dueDate}`, 14, 71);
  doc.text(`INVOICE NO: ${invoiceNumber}`, w - 14, 54, { align: "right" });

  // 6. Draw Table
  const tableBody = items.map((it) => [
    it.description,
    it.views > 0 ? it.views.toLocaleString("en-US") : "—",
    `$${it.amount.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: 78,
    head: [["DESCRIPTION", "VIEWS", "AMOUNT"]],
    body: tableBody,
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [15, 23, 42], // Dark slate matching reference
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center" },
      2: { halign: "right" },
    },
  });

  // 7. Totals Area
  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const rightAlignX = w - 14;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Subtotal:`, rightAlignX - 45, finalY);
  doc.text(`$${subtotal.toFixed(2)}`, rightAlignX, finalY, { align: "right" });

  let runningY = finalY + 5;
  if (discountAmount > 0) {
    doc.text(`Discount:`, rightAlignX - 45, runningY);
    doc.text(`-$${discountAmount.toFixed(2)}`, rightAlignX, runningY, { align: "right" });
    runningY += 5;
  }
  if (taxAmount > 0) {
    doc.text(`Tax:`, rightAlignX - 45, runningY);
    doc.text(`+$${taxAmount.toFixed(2)}`, rightAlignX, runningY, { align: "right" });
    runningY += 5;
  }

  // Highlighted Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(162, 28, 175);
  doc.text(`TOTAL PROFITS:`, rightAlignX - 45, runningY + 2);
  doc.text(`$${grandTotal.toFixed(2)}`, rightAlignX, runningY + 2, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // Dark green
  doc.text(`Amount Paid:`, rightAlignX - 45, runningY + 8);
  doc.text(`$${opts.amountPaid !== undefined ? opts.amountPaid.toFixed(2) : (grandTotal - remainingBalance).toFixed(2)}`, rightAlignX, runningY + 8, { align: "right" });

  doc.setTextColor(185, 28, 28); // Dark red
  doc.text(`Remaining Balance:`, rightAlignX - 45, runningY + 13);
  doc.text(`$${remainingBalance.toFixed(2)}`, rightAlignX, runningY + 13, { align: "right" });

  // 8. Pay To Details (Matching Attached Reference Image)
  const payY = runningY + 28;
  doc.setTextColor(162, 28, 175);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("PAY TO:", 14, payY);

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Account Name`, 14, payY + 5);
  doc.text(`KHALED MAHMOUD`, 42, payY + 5);
  doc.text(`Account Number`, 14, payY + 9);
  doc.text(`01125581125 (Vodafone Cash)`, 42, payY + 9);
  doc.text(`Address`, 14, payY + 13);
  doc.text(`Apartment 1, 2nd Floor, Building 113, Egypt`, 42, payY + 13);
  doc.text(`Email`, 14, payY + 17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(162, 28, 175);
  doc.text(companyEmail || `info@orientdigitals.com`, 42, payY + 17);

  // 9. Notes & Footer
  if (notes) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(`Notes: ${notes}`, 14, payY + 28);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Orient Digital  •  orientdigital.com`, w / 2, h - 8, { align: "center" });

  doc.save(filename);
}

export function exportChannelsToExcel(filename: string, channels: any[], isStaff: boolean) {
  const STATUS_AR: Record<string, string> = {
    active: "نشطة",
    paused: "متوقفة مؤقتاً",
    suspended: "موقوفة مؤقتاً",
    closed: "مغلقة",
  };

  const data = channels.map((c) => {
    const row: any = {
      "القناة": c.name,
      "العميل": c.clients?.name ?? "—",
    };

    if (isStaff) {
      row["السيستم"] = c.systems?.name ?? "مباشر";
    }

    row["نسبة العميل"] = `${c.client_percentage}%`;

    if (isStaff) {
      row["نسبة السيستم"] = c.system_id ? `${c.system_percentage}%` : "—";
      row["نسبة الشركة"] = `${c.company_percentage ?? (100 - c.client_percentage - (c.system_percentage ?? 0))}%`;
    }

    row["تفعيل الأرباح"] = c.is_monetized !== false ? "مفعلة" : "غير مفعلة";
    row["الحالة"] = STATUS_AR[c.status] || c.status;
    row["الرابط"] = c.link ?? "—";

    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Channels");
  XLSX.writeFile(wb, filename);
}


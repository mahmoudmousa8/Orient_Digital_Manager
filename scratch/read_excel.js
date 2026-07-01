import * as XLSX from "xlsx";
import * as fs from "fs";

try {
  const filePath = "C:\\Users\\Mahmoud\\Downloads\\YouTube Channel Tracker.xlsx";
  if (!fs.existsSync(filePath)) {
    console.error("File does not exist at:", filePath);
    process.exit(1);
  }

  // Handle default export if wrapped
  const x = XLSX.readFile ? XLSX : (XLSX.default || XLSX);
  console.log("XLSX Keys:", Object.keys(x));
  
  const workbook = x.readFile(filePath);
  console.log("Sheet Names:", workbook.SheetNames);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const data = x.utils.sheet_to_json(sheet, { header: 1 });
    console.log("Rows Count:", data.length);
    console.log("First 10 rows:");
    console.log(JSON.stringify(data.slice(0, 10), null, 2));
  }
} catch (error) {
  console.error("Error reading file:", error);
}

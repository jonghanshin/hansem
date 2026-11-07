import type ExcelJSModule from "exceljs";

import type { ExportTable } from "@/lib/export-rows";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ExportTable → xlsx 바이트. exceljs는 호출하는 쪽에서 넘긴다 (브라우저에서는 필요할 때만 불러오기 위해). */
export async function buildXlsx(ExcelJS: typeof ExcelJSModule, table: ExportTable): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(table.sheetName);

  sheet.columns = table.columns.map((c) => ({
    header: c.header,
    width: c.width,
    style: {
      numFmt: c.type === "money" ? "#,##0" : c.type === "date" ? "yyyy-mm-dd" : c.type === "number" ? "0" : "@",
      // 여러 줄 내용은 셀 안에서 줄바꿈해 보이게 하고 위쪽 정렬
      ...(c.wrap && { alignment: { wrapText: true, vertical: "top" as const } }),
    },
  }));
  for (const row of table.rows) {
    sheet.addRow(
      row.map((v, i) =>
        // 날짜는 실제 엑셀 날짜로 (UTC 자정 → 시간대와 무관하게 같은 날짜)
        table.columns[i].type === "date" && typeof v === "string" && ISO_DATE.test(v) ? new Date(`${v}T00:00:00Z`) : v,
      ),
    );
  }
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (table.rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

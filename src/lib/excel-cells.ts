import ExcelJS from "exceljs";

/** exceljs 셀 값을 단순 값(문자열/숫자/Date)으로 변환 */
export function plainCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== "object") return value;
  if ("richText" in value) return value.richText.map((t) => t.text).join("");
  if ("result" in value) return plainCellValue(value.result as ExcelJS.CellValue);
  if ("text" in value) return value.text;
  if ("error" in value) return null;
  return null;
}

/** 날짜 셀을 CSV와 같은 글자로: 날짜만 있으면 2026-10-30, 시각만 있으면 20:39:00 */
function dateText(date: Date): string {
  const [day, time] = date.toISOString().slice(0, 19).split("T");
  if (day === "1899-12-30") return time;
  return time === "00:00:00" ? day : `${day} ${time}`;
}

/** .xlsx 첫 번째 시트를 CSV처럼 글자 칸의 2차원 배열로 읽는다 */
export async function xlsxToCells(bytes: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const cells: string[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const value = plainCellValue(row.getCell(c).value);
      values.push(value === null ? "" : value instanceof Date ? dateText(value) : String(value));
    }
    cells.push(values);
  }
  return cells;
}

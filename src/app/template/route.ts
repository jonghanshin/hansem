import ExcelJS from "exceljs";

import { SITE_FIELDS } from "@/lib/sites";

// 엑셀 업로드용 빈 양식 (내용이 고정이라 빌드 시 한 번만 만들어진다)
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("현장정보");
  sheet.columns = SITE_FIELDS.map((f) => ({
    header: f.key,
    key: f.key,
    width: f.key === "현장주소" ? 50 : 14,
    style:
      f.type === "phone" || f.key === "현장번호" || f.key === "영업사원ID"
        ? { numFmt: "@" } // 텍스트 서식: 전화번호 앞자리 0이 사라지지 않게
        : f.type === "money"
          ? { numFmt: "#,##0" }
          : f.type === "date"
            ? { numFmt: "yyyy-mm-dd" }
            : {},
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="site-template.xlsx"; filename*=UTF-8''${encodeURIComponent("현장정보_양식.xlsx")}`,
    },
  });
}

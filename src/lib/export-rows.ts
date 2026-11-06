// 엑셀 내보내기용 표 데이터 만들기 (순수 함수: 브라우저/서버/테스트 공용)

import type { Deposit } from "@/lib/deposits";
import { formatPhone, SITE_FIELDS, type Site } from "@/lib/sites";

export type ExportColumnType = "text" | "money" | "date";

export type ExportColumn = { header: string; type: ExportColumnType; width: number };

/** date 열 값은 "YYYY-MM-DD" 문자열, money 열 값은 숫자 */
export type ExportCell = string | number | null;

export type ExportTable = { sheetName: string; columns: ExportColumn[]; rows: ExportCell[][] };

const WIDTH: Partial<Record<string, number>> = { 현장주소: 50, 입금내용: 40, 비고: 30, "A/S": 40, 현장번호: 16, 고객전화번호: 16 };

/**
 * 현장정보 → 엑셀. 컬럼명은 업로드 양식과 같아서, 내보낸 파일을 고쳐서 그대로 다시 업로드할 수 있다.
 * (자동 계산 컬럼은 업로드 시 무시되고 다시 계산됨)
 */
export function siteExportTable(sites: Site[]): ExportTable {
  const columns: ExportColumn[] = SITE_FIELDS.map((f) => ({
    header: f.key,
    type: f.type === "money" ? "money" : f.type === "date" ? "date" : "text",
    width: WIDTH[f.key] ?? (f.type === "money" ? 14 : 12),
  }));
  const rows = sites.map((s) =>
    SITE_FIELDS.map((f): ExportCell => {
      const v = s[f.key];
      if (v === null || v === undefined) return null;
      if (f.type === "phone") return formatPhone(String(v));
      return v;
    }),
  );
  return { sheetName: "현장정보", columns, rows };
}

const DEPOSIT_COLUMNS: { key: keyof Deposit; header: string; type: ExportColumnType }[] = [
  { key: "dateIso", header: "날짜", type: "date" },
  { key: "현장번호", header: "현장번호", type: "text" },
  { key: "고객명", header: "고객명", type: "text" },
  { key: "영업사원", header: "영업사원", type: "text" },
  { key: "입출금", header: "입출금", type: "text" },
  { key: "amount", header: "입금액", type: "money" },
  { key: "입금자", header: "입금자", type: "text" },
  { key: "입금내용", header: "입금내용", type: "text" },
  { key: "입금처", header: "입금처", type: "text" },
  { key: "입금구분", header: "입금구분", type: "text" },
  { key: "계약가", header: "계약가", type: "money" },
  { key: "현금영수증", header: "현금영수증", type: "text" },
  { key: "비고", header: "비고", type: "text" },
  { key: "A/S", header: "A/S", type: "text" },
];

const toNumber = (v: string | null) => {
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** 입금내역 → 엑셀. 텍스트로 저장된 금액/날짜를 숫자·날짜로 바꿔 엑셀에서 합계·정렬이 되게 한다. */
export function depositExportTable(deposits: Deposit[]): ExportTable {
  const columns = DEPOSIT_COLUMNS.map((c) => ({
    header: c.header,
    type: c.type,
    width: WIDTH[c.header] ?? (c.type === "money" ? 14 : 12),
  }));
  const rows = deposits.map((d) =>
    DEPOSIT_COLUMNS.map((c): ExportCell => {
      switch (c.key) {
        // 해석할 수 없는 값은 원문을 그대로 남긴다 (값을 잃지 않도록)
        case "dateIso":
          return d.dateIso ?? d.날짜;
        case "amount":
          return d.amount ?? d.입금액;
        case "계약가":
          return toNumber(d.계약가) ?? d.계약가;
        default:
          return (d[c.key] as string | null) ?? null;
      }
    }),
  );
  return { sheetName: "입금내역", columns, rows };
}

/** 파일명: 현장정보_20261105.xlsx */
export function exportFileName(base: string, now = new Date()) {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${base}_${ymd}.xlsx`;
}

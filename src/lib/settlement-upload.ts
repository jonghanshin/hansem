// 정산 화면의 CSV·엑셀 업로드: 대상 테이블 정의와 파일 내용 → 테이블 행 변환 (DB 접근 없음)

export const CSV_MAX_BYTES = 10 * 1024 * 1024; // next.config의 bodySizeLimit보다 작아야 함

type TableDefinition = {
  label: string;
  /** 전체 삭제 조건에 쓰는 컬럼 (테이블에 기본키가 없음) */
  anchorColumn: string;
  columns: readonly string[];
  integerColumns: ReadonlySet<string>;
  /** 원본 파일의 컬럼명이 테이블과 다른 경우: 파일 컬럼명 → 테이블 컬럼명 */
  headerAliases?: Readonly<Record<string, string>>;
  /** 금액을 글자로 저장하는 컬럼: 기존 데이터처럼 101,400 형식으로 맞춘다 */
  moneyColumns: ReadonlySet<string>;
};

export const UPLOAD_TABLES = {
  한샘주문진도정보: {
    label: "한샘주문진도정보",
    anchorColumn: "주문번호",
    headerAliases: { 거래처: "대리점" },
    moneyColumns: new Set([
      "공급가", "공급가(HS)", "공급가(S1)", "공가시공할인금액", "소비자가", "소비자가(HS)", "소비자가(S1)", "소가시공할인금액",
      "최종계약액", "최종계약액(HS)", "최종계약액(S1)",
    ]),
    columns: [
      "대리점", "영업사원코드", "영업사원", "계약현장번호", "주문번호", "주문등록일", "계약현장유형", "주문유형", "주문상태", "공정",
      "계약고객명", "설치고객명", "고객요청일", "시공일", "시공회사", "품목명", "홈플래너2.0", "공가품목할인금액", "소가품목할인금액",
      "공가DC금액", "소가DC금액", "공가품목쿠폰할인금액", "소가품목쿠폰할인금액", "공급가", "공급가(HS)", "공급가(S1)", "공가시공할인금액",
      "소비자가", "소비자가(HS)", "소비자가(S1)", "소가시공할인금액", "CR유형", "최종계약액", "최종계약액(HS)", "최종계약액(S1)", "구매동기",
      "BS비용", "전자계약서최종체결", "이벤트적용", "쿠폰적용", "유통경로", "판매채널", "사업장코드", "사업장", "거래처코드", "계약연락처",
      "설치연락처", "설치 주소", "메모", "견적번호", "품의번호", "물류반품판정완료일", "저장자", "ON주문번호", "홈솔 주문번호", "홈솔 견적번호",
      "최종저장일",
    ],
    integerColumns: new Set([
      "영업사원코드", "주문번호", "공가품목할인금액", "소가품목할인금액", "공가DC금액", "소가DC금액", "공가품목쿠폰할인금액",
      "소가품목쿠폰할인금액", "BS비용", "거래처코드",
    ]),
  },
  한샘추가시공비: {
    label: "한샘추가시공비",
    anchorColumn: "오더번호",
    moneyColumns: new Set(["시공비"]),
    columns: [
      "공장출고일", "시공시작일", "시공종료일", "시공계약정보", "현장코드", "오더번호", "주소", "영업그룹", "제품군", "사업장코드", "사업장명",
      "대리점코드", "대리점(제휴점)", "영업사원", "고객", "사업구분", "좌석명", "시공유형", "원현장코드", "요청번호", "시공협력사명",
      "시공협력기사명", "모바일상태", "구분", "품목/추가시공비명", "수량", "시공비", "비고", "뎁스1", "뎁스2", "청구처", "추가시공비비고",
      "작업내용비고", "상태", "확정여부",
    ],
    integerColumns: new Set(["오더번호", "대리점코드", "사업구분", "좌석명", "요청번호", "모바일상태", "구분", "수량", "상태"]),
  },
} as const satisfies Record<string, TableDefinition>;

export type UploadTable = keyof typeof UPLOAD_TABLES;
export type UploadRow = Record<string, string | number | null>;
export type CsvConversion = { ok: true; rows: UploadRow[] } | { ok: false; error: string };

export const UPLOAD_TABLE_KEYS = Object.keys(UPLOAD_TABLES) as UploadTable[];

export function isUploadTable(value: unknown): value is UploadTable {
  return typeof value === "string" && Object.hasOwn(UPLOAD_TABLES, value);
}

/** UTF-8로 읽고, UTF-8이 아니면 엑셀 한글 기본 인코딩(EUC-KR/CP949)으로 읽는다 */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

/** 큰따옴표 안의 쉼표·줄바꿈을 지원하는 CSV 파서. 닫히지 않은 따옴표가 있으면 null */
export function parseCsv(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) return null;
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toInteger(value: string): number | null {
  const plain = value.replace(/,/g, "");
  if (!/^-?\d+(\.0+)?$/.test(plain)) return null;
  const n = Number(plain);
  return Number.isSafeInteger(n) ? n : null;
}

function summarize(problems: string[]): string {
  const shown = problems.slice(0, 10).join("\n");
  return problems.length > 10 ? `${shown}\n외 ${problems.length - 10}건` : shown;
}

function withCommas(value: string): string {
  return /^-?\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+$)/g, ",") : value;
}

export function csvToRows(table: UploadTable, text: string): CsvConversion {
  const parsed = parseCsv(text);
  if (!parsed) return { ok: false, error: "CSV 형식이 올바르지 않습니다 (닫히지 않은 따옴표)" };
  return cellsToRows(table, parsed);
}

/**
 * CSV·엑셀에서 읽은 칸을 테이블 행으로 변환한다.
 * 한 건이라도 문제가 있으면 아무것도 넣지 않도록 전체를 오류로 돌려준다.
 */
export function cellsToRows(table: UploadTable, parsed: string[][]): CsvConversion {
  const definition: TableDefinition = UPLOAD_TABLES[table];
  if (parsed.length === 0) return { ok: false, error: "파일에 내용이 없습니다" };

  const known = new Set(definition.columns);
  const firstRow = parsed[0].map((h) => {
    const name = h.trim();
    return definition.headerAliases?.[name] ?? name;
  });
  // 컬럼명 행 없이 데이터부터 시작하는 파일은 테이블 컬럼 순서대로 읽는다
  const hasHeader = firstRow.some((h) => known.has(h));
  const columnCount = definition.columns.length;
  if (!hasHeader && (firstRow.length < columnCount || firstRow.slice(columnCount).some((c) => c !== ""))) {
    return {
      ok: false,
      error: `${definition.label} 양식과 맞지 않는 파일입니다.\n첫 행에 컬럼명이 없고, 컬럼 수도 ${definition.columns.length}개가 아닙니다 (${firstRow.length}개)`,
    };
  }
  const headers = hasHeader ? firstRow : [...definition.columns];
  while (headers.at(-1) === "") headers.pop(); // 엑셀이 끝에 붙이는 빈 컬럼

  const missing = definition.columns.filter((c) => !headers.includes(c));
  const unknown = headers.filter((h) => !known.has(h));
  const duplicated = headers.filter((h, i) => headers.indexOf(h) !== i);
  const headerProblems = [
    missing.length > 0 && `파일에 없는 컬럼: ${missing.join(", ")}`,
    unknown.length > 0 && `테이블에 없는 컬럼: ${unknown.map((h) => h || "(빈 이름)").join(", ")}`,
    duplicated.length > 0 && `중복된 컬럼: ${[...new Set(duplicated)].join(", ")}`,
  ].filter((p): p is string => !!p);
  if (headerProblems.length > 0) {
    return { ok: false, error: `${definition.label} 양식과 맞지 않는 파일입니다.\n${headerProblems.join("\n")}` };
  }

  const rows: UploadRow[] = [];
  const problems: string[] = [];
  const firstDataRow = hasHeader ? 1 : 0;
  parsed.slice(firstDataRow).forEach((cells, index) => {
    if (cells.every((c) => c.trim() === "")) return;
    const rowNumber = index + firstDataRow + 1;
    if (cells.length < headers.length || cells.slice(headers.length).some((c) => c.trim() !== "")) {
      problems.push(`${rowNumber}행: 컬럼 수가 ${headers.length}개가 아닙니다 (${cells.length}개)`);
      return;
    }
    const row: UploadRow = {};
    headers.forEach((column, i) => {
      const value = cells[i].trim();
      if (value === "") row[column] = null;
      else if (!definition.integerColumns.has(column)) row[column] = definition.moneyColumns.has(column) ? withCommas(value) : value;
      else {
        const n = toInteger(value);
        if (n === null) problems.push(`${rowNumber}행 ${column}: "${value}"은(는) 정수가 아닙니다`);
        row[column] = n;
      }
    });
    rows.push(row);
  });

  if (problems.length > 0) return { ok: false, error: `아래 문제로 업로드하지 않았습니다.\n${summarize(problems)}` };
  if (rows.length === 0) return { ok: false, error: "데이터 행이 없습니다" };
  return { ok: true, rows };
}

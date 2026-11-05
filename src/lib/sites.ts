// 현장정보 테이블의 필드 정의와 값 정규화 로직.
// 서버(액션)와 클라이언트(화면) 양쪽에서 함께 사용한다.

export type FieldType = "text" | "phone" | "money" | "date";

export const SITE_FIELDS = [
  { key: "현장번호", type: "text" },
  { key: "고객명", type: "text" },
  { key: "고객전화번호", type: "phone" },
  { key: "영업사원", type: "text" },
  { key: "영업사원ID", type: "text" },
  { key: "현장주소", type: "text" },
  { key: "계약경로", type: "text" },
  { key: "계약가", type: "money" },
  { key: "상품가액", type: "money" },
  { key: "시공비", type: "money" },
  { key: "공사품목", type: "text" },
  { key: "공사시기", type: "date" },
  { key: "계약일", type: "date" },
  { key: "완료일", type: "date" },
  { key: "한샘공급가합계", type: "money" },
  { key: "한샘물대", type: "money" },
  { key: "한샘시공비", type: "money" },
  { key: "한샘추가시공비", type: "money" },
  { key: "한샘시공비외", type: "money" },
  { key: "정산여부", type: "text" },
  { key: "정산월", type: "text" },
  { key: "환불금액", type: "money" },
] as const satisfies readonly { key: string; type: FieldType }[];

export type SiteFieldKey = (typeof SITE_FIELDS)[number]["key"];

/**
 * 다른 테이블에서 자동 계산되는 필드. 화면에서는 읽기 전용이고,
 * 저장/업로드 값은 무시되며 서버가 계산한 값으로 테이블을 갱신한다 (src/lib/site-totals.ts).
 */
export const COMPUTED_FIELDS = {
  한샘공급가합계: "한샘주문진도정보 · 주문상태 '확정' · 공급가 합계",
  한샘물대: "한샘주문진도정보 · 주문상태 '확정' · 공급가(HS) 합계",
  한샘시공비: "한샘주문진도정보 · 주문상태 '확정' · 공급가(S1) 합계",
  한샘시공비외: "입금내역 · 입금구분 '한샘 외 시공비' · 입금액 합계",
  환불금액: "입금내역 · 입금구분 '거래처환불' · 입금액 합계",
} as const satisfies Partial<Record<SiteFieldKey, string>>;

export type ComputedFieldKey = keyof typeof COMPUTED_FIELDS;

/** 자동 계산 필드의 근거가 되는 원본 행 (상세 내역 보기용) */
export type HansemOrderLine = {
  주문번호: number | null;
  주문등록일: string | null;
  공정: string | null;
  품목명: string | null;
  시공일: string | null;
  공급가: number | null;
  "공급가(HS)": number | null;
  "공급가(S1)": number | null;
};

export type ConstructionCostLine = {
  날짜: string | null; // YYYY-MM-DD (해석 불가 시 원문)
  입출금: string | null;
  입금액: number | null;
  입금자: string | null;
  입금내용: string | null;
  입금처: string | null;
};

export type ComputedSources =
  | { kind: "orders"; column: "공급가" | "공급가(HS)" | "공급가(S1)"; rows: HansemOrderLine[]; total: number }
  | { kind: "deposits"; rows: ConstructionCostLine[]; total: number };

export function isComputedField(key: string): key is ComputedFieldKey {
  return Object.hasOwn(COMPUTED_FIELDS, key);
}

/** 사용자가 입력/수정할 수 있는 값 */
export type SiteInput = {
  현장번호: string | null; // DB는 NOT NULL. 저장 시 normalizeSiteInput에서 필수 검사
  고객명: string | null;
  고객전화번호: string | null;
  영업사원: string | null;
  영업사원ID: string | null;
  현장주소: string | null;
  계약경로: string | null;
  계약가: number | null;
  상품가액: number | null;
  시공비: number | null;
  공사품목: string | null;
  공사시기: string | null; // YYYY-MM-DD
  계약일: string | null;
  완료일: string | null;
  한샘공급가합계: number | null;
  한샘물대: number | null;
  한샘시공비: number | null;
  한샘추가시공비: number | null;
  한샘시공비외: number | null;
  정산여부: string | null;
  정산월: string | null;
  환불금액: number | null;
};

export type Site = SiteInput & { id: number; created_at: string };

/** 입금 등록 화면에서 현장번호 선택 시 고객명/영업사원/계약가 자동 채움용 (완료일: 진행 중 여부 판단) */
export type SiteSummary = Pick<Site, "현장번호" | "고객명" | "영업사원" | "계약가" | "완료일">;

/** 로그인한 영업사원 (권한 테이블의 영업사원ID·이름). 새 현장에 자동으로 넣는다 */
export type Salesperson = { 영업사원ID: string; 영업사원: string | null };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** 엑셀 헤더 → 필드 키 매칭용. "영업사원 ID", "영업사원\nID" 등 공백 차이를 무시한다. */
export function normalizeHeader(header: string): string {
  return header.replace(/\s+/g, "");
}

const FIELD_BY_HEADER = new Map<string, SiteFieldKey>(
  SITE_FIELDS.map((f) => [normalizeHeader(f.key), f.key]),
);

export function fieldKeyForHeader(header: string): SiteFieldKey | undefined {
  return FIELD_BY_HEADER.get(normalizeHeader(header));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isValidYmd(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 다양한 형태의 날짜 값을 YYYY-MM-DD 문자열로 바꾼다. 해석할 수 없으면 undefined. */
export function toIsoDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    // 엑셀 날짜는 UTC 자정으로 들어오므로 UTC 기준으로 읽는다.
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === "number") {
    // 엑셀 날짜 일련번호 (1900 날짜 체계)
    if (value < 1 || value > 2958465) return undefined;
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return toIsoDate(new Date(ms));
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidYmd(y, mo, d)) return undefined;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** "6,400,000", "6400000원", 6400000 → 6400000. 해석할 수 없으면 undefined. */
export function toMoney(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }
  const s = String(value).replace(/[,\s원₩]/g, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Math.round(Number(s));
}

/** 숫자만 남기고, 엑셀에서 앞자리 0이 빠진 휴대폰 번호(10xxxxxxxx)는 0을 복원한다. */
export function toPhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (/^1[016789]\d{7,8}$/.test(digits)) return `0${digits}`;
  return digits;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** 임의의 입력값을 검증/정규화한다. 서버 액션에서 반드시 이 함수를 거쳐 저장한다. */
export function normalizeSiteInput(raw: Partial<Record<SiteFieldKey, unknown>>): {
  data: SiteInput;
  errors: string[];
} {
  const errors: string[] = [];
  const data = {} as Record<SiteFieldKey, string | number | null>;

  for (const field of SITE_FIELDS) {
    const value = raw[field.key];
    switch (field.type) {
      case "text":
        data[field.key] = toText(value);
        break;
      case "phone":
        data[field.key] = toPhone(value);
        break;
      case "money": {
        const n = toMoney(value);
        if (n === undefined) {
          errors.push(`${field.key}: 숫자가 아닙니다 (${String(value)})`);
          data[field.key] = null;
        } else {
          data[field.key] = n;
        }
        break;
      }
      case "date": {
        const d = toIsoDate(value);
        if (d === undefined) {
          errors.push(`${field.key}: 날짜 형식이 아닙니다 (${String(value)})`);
          data[field.key] = null;
        } else {
          data[field.key] = d;
        }
        break;
      }
    }
  }

  if (SITE_FIELDS.every((f) => data[f.key] === null)) {
    errors.push("입력된 값이 없습니다");
  } else if (data.현장번호 === null) {
    errors.push("현장번호를 입력하세요"); // 테이블에서 필수(NOT NULL) 컬럼
  }

  return { data: data as SiteInput, errors };
}

export function formatMoney(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : n.toLocaleString("ko-KR");
}

export function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  if (/^01\d{8,9}$/.test(p)) {
    return p.length === 10
      ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
      : `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  }
  return p;
}

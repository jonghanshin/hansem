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
  { key: "한샘상품가액", type: "money" },
  { key: "한샘상품물대", type: "money" },
  { key: "한샘상품시공비", type: "money" },
  { key: "홈씨씨상품가액", type: "money" },
  { key: "시공비", type: "money" },
  { key: "공사품목", type: "text" },
  { key: "공사시기", type: "date" },
  { key: "계약일", type: "date" },
  { key: "완료예정일", type: "date" },
  { key: "완료일", type: "date" },
  { key: "한샘공급가합계", type: "money" },
  { key: "한샘물대", type: "money" },
  { key: "한샘시공비", type: "money" },
  { key: "한샘추가시공비", type: "money" },
  { key: "한샘시공비외", type: "money" },
  { key: "정산여부", type: "text" },
  { key: "정산월", type: "text" },
  { key: "환불금액", type: "money" },
  { key: "특이사항", type: "text" },
] as const satisfies readonly { key: string; type: FieldType }[];

/** 특이사항 최대 글자 수 */
export const SITE_NOTE_MAX_LENGTH = 2000;

export type SiteFieldKey = (typeof SITE_FIELDS)[number]["key"];

/** 화면에 컬럼명과 다르게 보여줄 이름 (현장 상세·새 현장 화면) */
const FIELD_LABELS: Partial<Record<SiteFieldKey, string>> = {
  한샘상품가액: "한샘",
  한샘상품물대: "한샘물대",
  한샘상품시공비: "한샘시공비",
  홈씨씨상품가액: "홈씨씨",
};

/** 한샘(한샘상품가액) = 한샘물대 + 한샘시공비. 새 현장/현장 상세의 '한샘' 팝업에서 나눠 입력한다 */
export const HANSEM_PARTS = ["한샘상품물대", "한샘상품시공비"] as const satisfies readonly SiteFieldKey[];

export function fieldLabel(key: SiteFieldKey): string {
  return FIELD_LABELS[key] ?? key;
}

/** 계약가 = 시공비 + 한샘 + 홈씨씨 이어야 한다 */
export const CONTRACT_PARTS = ["시공비", "한샘상품가액", "홈씨씨상품가액"] as const satisfies readonly SiteFieldKey[];

/**
 * 계약가와 (시공비 + 한샘 + 홈씨씨) 합계 검사. 네 칸이 모두 비어 있으면 검사하지 않고, 빈 칸은 0으로 본다.
 * 맞으면 null, 다르면 오류 문구.
 */
export function contractSumError(v: Pick<SiteInput, "계약가" | (typeof CONTRACT_PARTS)[number]>): string | null {
  if (v.계약가 === null && CONTRACT_PARTS.every((k) => v[k] === null)) return null;
  const sum = CONTRACT_PARTS.reduce((acc, k) => acc + (v[k] ?? 0), 0);
  const contract = v.계약가 ?? 0;
  if (sum === contract) return null;
  return `시공비 + 한샘 + 홈씨씨 합계(${formatMoney(sum)})가 계약가(${formatMoney(contract)})와 ${formatMoney(Math.abs(sum - contract))}원 차이 납니다`;
}

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
  한샘상품가액: number | null;
  /** 한샘상품가액 중 물대 (한샘주문진도정보에서 계산하는 한샘물대와 별개) */
  한샘상품물대: number | null;
  /** 한샘상품가액 중 시공비 (한샘주문진도정보에서 계산하는 한샘시공비와 별개) */
  한샘상품시공비: number | null;
  홈씨씨상품가액: number | null;
  시공비: number | null;
  공사품목: string | null;
  공사시기: string | null; // YYYY-MM-DD
  계약일: string | null;
  완료예정일: string | null;
  완료일: string | null;
  한샘공급가합계: number | null;
  한샘물대: number | null;
  한샘시공비: number | null;
  한샘추가시공비: number | null;
  한샘시공비외: number | null;
  정산여부: string | null;
  정산월: string | null;
  환불금액: number | null;
  /** 자유 메모 (여러 줄) */
  특이사항: string | null;
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

/** 이전 컬럼명 → 현재 필드 (예전 양식으로 만든 엑셀도 업로드할 수 있게) */
const HEADER_ALIASES: Record<string, SiteFieldKey> = {
  상품가액: "한샘상품가액",
};

const FIELD_BY_HEADER = new Map<string, SiteFieldKey>([
  ...Object.entries(HEADER_ALIASES).map(([h, k]) => [normalizeHeader(h), k] as const),
  ...SITE_FIELDS.map((f) => [normalizeHeader(f.key), f.key] as const),
]);

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

/**
 * 전화번호는 입력한 그대로(앞뒤 공백만 제거) 저장한다.
 * 단, 엑셀에서 숫자 서식으로 읽힌 휴대폰 번호는 앞자리 0이 빠져 있으므로(예: 1035368885) 0을 복원한다.
 */
export function toPhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const digits = String(value);
    return /^1[016789]\d{7,8}$/.test(digits) ? `0${digits}` : digits;
  }
  const s = String(value).trim();
  return s ? s : null;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** 여러 줄 메모: 줄바꿈은 \n으로 통일하고 앞뒤 공백만 제거 */
function toNote(value: unknown): string | null {
  return toText(value === null || value === undefined ? value : String(value).replace(/\r\n?/g, "\n"));
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
        data[field.key] = field.key === "특이사항" ? toNote(value) : toText(value);
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

  // 한샘물대·한샘시공비를 나눠 입력했으면 한샘(한샘상품가액)은 두 값의 합계로 저장한다
  if (HANSEM_PARTS.some((k) => data[k] !== null)) {
    data.한샘상품가액 = HANSEM_PARTS.reduce((acc, k) => acc + ((data[k] as number | null) ?? 0), 0);
  }

  if (typeof data.특이사항 === "string" && data.특이사항.length > SITE_NOTE_MAX_LENGTH) {
    errors.push(`특이사항은 ${SITE_NOTE_MAX_LENGTH}자 이내로 입력하세요`);
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

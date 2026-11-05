// 입금내역 테이블. 모든 컬럼이 text로 저장되어 있어(금액 "1,480,000", 날짜 "2026년 10월 29일")
// 화면용으로 숫자/날짜를 함께 파싱해 둔다.

import { formatMoney, toIsoDate, toMoney } from "@/lib/sites";

export type DepositRow = {
  고객명: string | null;
  영업사원: string | null;
  현장번호: string | null;
  계약가: string | null;
  입금액: string | null;
  입출금: string | null;
  입금자: string | null;
  입금내용: string | null;
  입금처: string | null;
  입금구분: string | null;
  날짜: string | null;
  현금영수증: string | null;
  비고: string | null;
};

/** 내용 컬럼 (id 제외). 승인필요입금내역도 같은 컬럼을 가진다. */
export const DEPOSIT_COLUMNS = [
  "고객명",
  "영업사원",
  "현장번호",
  "계약가",
  "입금액",
  "입출금",
  "입금자",
  "입금내용",
  "입금처",
  "입금구분",
  "날짜",
  "현금영수증",
  "비고",
] as const satisfies readonly (keyof DepositRow)[];

/** 입금내역 테이블의 한 행 (id 포함) */
export type DepositRecord = DepositRow & { id: number };

export type Parsed<R extends DepositRow> = R & {
  /** 날짜를 YYYY-MM-DD로 해석한 값 (해석 불가 시 null, 원문은 `날짜`) */
  dateIso: string | null;
  /** 입금액을 숫자로 해석한 값 (해석 불가 시 null, 원문은 `입금액`) */
  amount: number | null;
};

export type Deposit = Parsed<DepositRecord>;

/** 행에서 내용 컬럼만 뽑는다 */
export function pickDepositRow(row: DepositRow): DepositRow {
  return Object.fromEntries(DEPOSIT_COLUMNS.map((c) => [c, row[c] ?? null])) as DepositRow;
}

export function sameDepositRow(a: DepositRow, b: DepositRow): boolean {
  return DEPOSIT_COLUMNS.every((c) => (a[c] ?? null) === (b[c] ?? null));
}

/** 수정 화면 입력값으로 변환 */
export function depositToInput(d: Deposit): DepositInput {
  return {
    현장번호: d.현장번호 ?? "",
    고객명: d.고객명 ?? "",
    영업사원: d.영업사원 ?? "",
    구분: depositCategoryOf(d) ?? "",
    입금액: d.amount !== null ? formatMoney(d.amount) : (d.입금액 ?? ""),
    날짜: d.dateIso ?? "",
    입금내용: categoryRule(depositCategoryOf(d))?.입금내용 === null ? (d.입금내용 ?? "") : "",
    거래처: categoryRule(depositCategoryOf(d))?.입금자 === "vendor" ? (d.입금자 ?? "") : "",
    현금영수증: cashReceiptToInput(d.현금영수증),
  };
}

export function toDeposit<R extends DepositRow>(row: R): Parsed<R> {
  return {
    ...row,
    dateIso: toIsoDate(row.날짜) ?? null,
    amount: toMoney(row.입금액) ?? null,
  };
}

/** 최신 날짜 먼저, 날짜를 모르는 행은 맨 뒤 */
export function sortDepositsDesc<T extends Parsed<DepositRow>>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.dateIso === null || b.dateIso === null ? compareDeposits(a, b) : compareDeposits(b, a),
  );
}

export const DEPOSIT_KINDS = ["입금", "출금"] as const;

/** 입금내역 테이블의 입금구분 값 (목록 검색용) */
export const DEPOSIT_TYPES = ["한샘물대", "한샘시공비", "한샘 외 시공비", "거래처환불"] as const;

/** 현장정보.한샘시공비외 합계 대상 입금구분 */
export const CONSTRUCTION_TYPE = "한샘 외 시공비";
/** 현장정보.환불금액 합계 대상 입금구분 */
export const REFUND_TYPE = "거래처환불";

/**
 * 입금 등록·수정 화면에서 고르는 입금구분. 입금구분 컬럼에 그대로 저장되고, 고른 값으로 입출금·입금내용이 정해진다.
 */
export const DEPOSIT_CATEGORIES = ["한샘물대", "한샘시공비", "한샘 외 시공비", "거래처환불"] as const;
export type DepositCategory = (typeof DEPOSIT_CATEGORIES)[number];

/** 현금영수증 선택값 (수정 화면에서만 입력) */
export const CASH_RECEIPT_OPTIONS = ["발행", "미발행"] as const;

/** 저장된 현금영수증 값 → 수정 화면 선택값 (발행/미발행이 아니면 "" = 기존 값 유지) */
function cashReceiptToInput(value: string | null): string {
  if (value === "발행" || value === "미발행") return value;
  if (value === "미발급") return "미발행"; // 예전 표기
  return "";
}

/** 한샘 외 시공비 출금의 입금자 */
export const NABI_PAYER = "나비지급";

export const CATEGORY_RULES: Record<
  DepositCategory,
  {
    입출금: string;
    입금구분: string;
    입금내용: string | null; // null이면 화면에서 입력
    /** customer: 현장정보의 고객명, vendor: 화면에서 입력한 거래처명, 그 외는 고정값 */
    입금자: "customer" | "vendor" | typeof NABI_PAYER;
  }
> = {
  한샘물대: { 입출금: "입금", 입금구분: "한샘물대", 입금내용: "한샘물대", 입금자: "customer" },
  한샘시공비: { 입출금: "입금", 입금구분: "한샘시공비", 입금내용: "한샘시공비", 입금자: "customer" },
  "한샘 외 시공비": { 입출금: "출금", 입금구분: "한샘 외 시공비", 입금내용: null, 입금자: NABI_PAYER },
  거래처환불: { 입출금: "입금", 입금구분: "거래처환불", 입금내용: null, 입금자: "vendor" },
};

/** 구분 문자열 → 규칙 (모르는 값이면 null) */
export function categoryRule(category: string | null | undefined) {
  return category && (DEPOSIT_CATEGORIES as readonly string[]).includes(category)
    ? CATEGORY_RULES[category as DepositCategory]
    : null;
}

/** 저장된 행이 화면의 어느 구분에 해당하는지 (해당 없으면 null) */
export function depositCategoryOf(row: Pick<DepositRow, "입금구분" | "입금내용">): DepositCategory | null {
  if ((DEPOSIT_CATEGORIES as readonly (string | null)[]).includes(row.입금구분)) return row.입금구분 as DepositCategory;
  // 예전 형식 (입금구분 한샘/시공비/거래처환불입금)
  if (row.입금구분 === "시공비") return "한샘 외 시공비";
  if (row.입금구분 === "거래처환불입금") return "거래처환불";
  if (row.입금구분 === "한샘" && (row.입금내용 === "한샘물대" || row.입금내용 === "한샘시공비")) return row.입금내용;
  return null;
}

/**
 * 입력 폼에서 받는 값.
 * 입금자는 입금구분으로 정한다 (한샘물대·한샘시공비 = 현장정보 고객명, 한샘 외 시공비 = 나비지급, 거래처환불 = 입력한 거래처명).
 * 계약가·입금처·비고는 화면에서 받지 않는다 (수정 시에는 기존 값 유지).
 * 현금영수증은 수정 화면에서만 발행/미발행을 고르고, 고르지 않으면 기존 값을 유지한다.
 */
export type DepositInput = {
  현장번호: string;
  고객명: string;
  영업사원: string;
  /** 한샘물대 / 한샘시공비 / 한샘 외 시공비 / 거래처환불 */
  구분: string;
  입금액: string;
  날짜: string; // YYYY-MM-DD
  /** 구분이 '한샘 외 시공비'·'거래처환불'일 때만 사용 */
  입금내용: string;
  /** 구분이 '거래처환불'일 때 입금자로 저장 */
  거래처: string;
  /** 발행 / 미발행 / "" (수정 화면에서만, ""이면 기존 값 유지) */
  현금영수증: string;
};

/** "2026-10-29" → "2026년 10월 29일" (기존 데이터와 같은 형식으로 저장) */
function toKoreanDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * 입금 입력값 검증 + 테이블 저장 형식으로 변환.
 * 입금내역은 모든 컬럼이 text라서 기존 행과 똑같이 금액은 "1,480,000", 날짜는 "2026년 10월 29일"로 저장한다.
 */
export function normalizeDepositInput(raw: Partial<Record<keyof DepositInput, unknown>>): {
  data: DepositRow;
  errors: string[];
} {
  const errors: string[] = [];
  const text = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s ? s : null;
  };

  const 현장번호 = text(raw.현장번호);
  if (!현장번호) errors.push("현장번호를 입력하세요");

  // 구분 → 입출금·입금구분·입금내용
  const 구분 = text(raw.구분);
  const rule = categoryRule(구분);
  if (!rule) errors.push(`입금구분은 ${DEPOSIT_CATEGORIES.join(", ")} 중에서 선택하세요`);
  const 입금내용 = rule ? (rule.입금내용 ?? text(raw.입금내용)) : null;
  if (rule && !rule.입금내용 && !입금내용) errors.push(`${구분}: 입금내용을 입력하세요`);
  const 거래처 = rule?.입금자 === "vendor" ? text(raw.거래처) : null;
  if (rule?.입금자 === "vendor" && !거래처) errors.push(`${구분}: 거래처를 입력하세요`);

  const 현금영수증 = text(raw.현금영수증);
  if (현금영수증 && !(CASH_RECEIPT_OPTIONS as readonly string[]).includes(현금영수증)) {
    errors.push(`현금영수증은 ${CASH_RECEIPT_OPTIONS.join(", ")} 중에서 선택하세요`);
  }

  const amount = toMoney(raw.입금액);
  if (amount === null) errors.push("금액을 입력하세요");
  else if (amount === undefined || amount <= 0) errors.push("금액은 0보다 큰 숫자여야 합니다");

  const dateIso = toIsoDate(raw.날짜);
  if (dateIso === null) errors.push("날짜를 입력하세요");
  else if (dateIso === undefined) errors.push("날짜 형식이 올바르지 않습니다");

  return {
    errors,
    data: {
      현장번호,
      고객명: text(raw.고객명),
      영업사원: text(raw.영업사원),
      계약가: null, // 화면에서 받지 않음 (수정 시 기존 값은 서버에서 유지)
      입금액: typeof amount === "number" ? formatMoney(amount) : null,
      입출금: rule?.입출금 ?? null,
      입금자: 거래처, // 거래처환불은 입력한 거래처명, 그 외는 서버에서 입금구분에 따라 채움
      입금내용,
      입금처: null,
      입금구분: rule?.입금구분 ?? null,
      날짜: dateIso ? toKoreanDate(dateIso) : null,
      현금영수증, // 비어 있으면 수정 시 서버에서 기존 값 유지
      비고: null,
    },
  };
}

/** 날짜 오름차순, 날짜를 모르는 행은 맨 뒤 */
export function compareDeposits(a: Parsed<DepositRow>, b: Parsed<DepositRow>) {
  if (a.dateIso === b.dateIso) return 0;
  if (a.dateIso === null) return 1;
  if (b.dateIso === null) return -1;
  return a.dateIso < b.dateIso ? -1 : 1;
}

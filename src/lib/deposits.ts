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
  /** A/S 내용 (자유 입력) */
  "A/S": string | null;
  /** 거래처 정보 (입금 등록 화면의 '거래처 정보 등록' 팝업에서 공정별거래처 중 선택) */
  공정: string | null;
  주요작업: string | null;
  업체: string | null;
  업체담당자성함: string | null;
  업체담당자연락처: string | null;
  업체비고: string | null;
  업체은행: string | null;
  업체예금주: string | null;
  업체계좌번호: string | null;
};

/** 거래처 정보 컬럼 (입금내역·승인필요입금내역 공통) */
export const VENDOR_INFO_COLUMNS = [
  "공정",
  "주요작업",
  "업체",
  "업체담당자성함",
  "업체담당자연락처",
  "업체은행",
  "업체예금주",
  "업체계좌번호",
  "업체비고",
] as const;
export type VendorInfoKey = (typeof VENDOR_INFO_COLUMNS)[number];
export type VendorInfo = Record<VendorInfoKey, string>;
export const EMPTY_VENDOR_INFO = Object.fromEntries(VENDOR_INFO_COLUMNS.map((c) => [c, ""])) as VendorInfo;
const VENDOR_INFO_MAX_LENGTH = 2000;

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
  "A/S",
  ...VENDOR_INFO_COLUMNS,
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
  const 현금영수증 = cashReceiptToInput(d.현금영수증);
  // 발급불필요면 비고 끝 줄의 사유를 사유 칸으로 옮긴다 (저장 시 다시 끝 줄에 붙임)
  const note =
    현금영수증 === CASH_RECEIPT_NOT_NEEDED
      ? splitCashReceiptReason(d["A/S"] ?? "")
      : { note: d["A/S"] ?? "", reason: "" };
  return {
    현장번호: d.현장번호 ?? "",
    고객명: d.고객명 ?? "",
    영업사원: d.영업사원 ?? "",
    구분: depositCategoryOf(d) ?? "",
    입금액: d.amount !== null ? formatMoney(d.amount) : (d.입금액 ?? ""),
    입출금: categoryRule(depositCategoryOf(d))?.입출금 === null ? (d.입출금 ?? "") : "",
    날짜: d.dateIso ?? "",
    입금내용: categoryRule(depositCategoryOf(d))?.입금내용 === null ? (d.입금내용 ?? "") : "",
    거래처: categoryRule(depositCategoryOf(d))?.입금자 === "vendor" ? (d.입금자 ?? "") : "",
    현금영수증,
    현금영수증사유: note.reason,
    "A/S": note.note,
    ...Object.fromEntries(VENDOR_INFO_COLUMNS.map((c) => [c, d[c] ?? ""])) as VendorInfo,
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
export const DEPOSIT_TYPES = [
  "한샘물대", "한샘시공비", "홈씨씨창호", "한샘 외 시공비", "거래처환불",
  "계약금1", "계약금2", "착수금1", "착수금2",
  "중도금1", "중도금2", "중도금3", "잔금1", "잔금2",
] as const;

/** 현장정보.한샘시공비외 합계 대상 입금구분 */
export const CONSTRUCTION_TYPE = "한샘 외 시공비";
/** 현장정보.환불금액 합계 대상 입금구분 */
export const REFUND_TYPE = "거래처환불";

/**
 * 입금 등록·수정 화면에서 고르는 입금구분. 입금구분 컬럼에 그대로 저장되고, 고른 값으로 입출금·입금내용이 정해진다.
 */
export const DEPOSIT_CATEGORIES = DEPOSIT_TYPES;
export type DepositCategory = (typeof DEPOSIT_CATEGORIES)[number];

/**
 * 영수증 선택값 (등록 시 필수). 테이블 컬럼 이름은 그대로 '현금영수증'이고 화면에는 '영수증'으로 보여준다.
 */
export const CASH_RECEIPT_OPTIONS = [
  "현금영수증발행완료",
  "현금영수증발행필요",
  "세금계산서발행완료",
  "세금계산서발행필요",
  "발급불필요",
  "카드결제",
] as const;

/** 이 값을 고르면 세부 사유를 받아 비고(A/S) 맨 끝 줄에 붙인다 */
export const CASH_RECEIPT_NOT_NEEDED = "발급불필요";
const CASH_RECEIPT_REASON_PREFIX = "영수증 발급불필요 사유: ";
/** 예전에 저장된 사유 줄 머리말 (수정 화면에서 함께 인식) */
const LEGACY_REASON_PREFIXES = [CASH_RECEIPT_REASON_PREFIX, "현금영수증 발급불필요 사유: "];
export const CASH_RECEIPT_REASON_MAX_LENGTH = 200;

/** 비고 맨 끝 줄의 발급불필요 사유를 떼어 낸다 (수정 화면에서 사유 칸으로 되돌리기 위해) */
function splitCashReceiptReason(note: string): { note: string; reason: string } {
  const lines = note.split("\n");
  const last = lines.at(-1) ?? "";
  const prefix = LEGACY_REASON_PREFIXES.find((p) => last.startsWith(p));
  if (!prefix) return { note, reason: "" };
  return { note: lines.slice(0, -1).join("\n").trimEnd(), reason: last.slice(prefix.length).trim() };
}

/** 예전 표기 → 현재 선택값 (수정 화면에서 바뀐 이름으로 미리 선택되고, 저장하면 새 이름으로 바뀐다) */
const CASH_RECEIPT_LEGACY: Record<string, (typeof CASH_RECEIPT_OPTIONS)[number]> = {
  발행완료: "현금영수증발행완료",
  발급필요: "현금영수증발행필요",
  발행: "현금영수증발행완료",
  미발행: "현금영수증발행필요",
  미발급: "현금영수증발행필요",
};

/** 저장된 현금영수증 값 → 수정 화면 선택값 (선택지에 없는 값이면 "" = 기존 값 유지) */
function cashReceiptToInput(value: string | null): string {
  if (value && (CASH_RECEIPT_OPTIONS as readonly string[]).includes(value)) return value;
  if (value && Object.hasOwn(CASH_RECEIPT_LEGACY, value)) return CASH_RECEIPT_LEGACY[value];
  return "";
}

/** 한샘 외 시공비 출금의 입금자 */
export const NABI_PAYER = "나비지급";

export const CATEGORY_RULES: Record<
  DepositCategory,
  {
    /** null이면 화면에서 입금/출금을 선택 (필수) */
    입출금: (typeof DEPOSIT_KINDS)[number] | null;
    입금구분: string;
    입금내용: string | null; // null이면 화면에서 입력
    /** customer: 현장정보의 고객명, vendor: 화면에서 입력한 거래처명, 그 외는 고정값 */
    입금자: "customer" | "vendor" | typeof NABI_PAYER;
  }
> = {
  한샘물대: { 입출금: "입금", 입금구분: "한샘물대", 입금내용: "한샘물대", 입금자: "customer" },
  한샘시공비: { 입출금: "입금", 입금구분: "한샘시공비", 입금내용: "한샘시공비", 입금자: "customer" },
  홈씨씨창호: { 입출금: null, 입금구분: "홈씨씨창호", 입금내용: "홈씨씨창호", 입금자: "customer" },
  "한샘 외 시공비": { 입출금: "출금", 입금구분: "한샘 외 시공비", 입금내용: null, 입금자: NABI_PAYER },
  거래처환불: { 입출금: "입금", 입금구분: "거래처환불", 입금내용: null, 입금자: "vendor" },
  계약금1: { 입출금: "입금", 입금구분: "계약금1", 입금내용: "계약금1", 입금자: "customer" },
  계약금2: { 입출금: "입금", 입금구분: "계약금2", 입금내용: "계약금2", 입금자: "customer" },
  착수금1: { 입출금: "입금", 입금구분: "착수금1", 입금내용: "착수금1", 입금자: "customer" },
  착수금2: { 입출금: "입금", 입금구분: "착수금2", 입금내용: "착수금2", 입금자: "customer" },
  중도금1: { 입출금: "입금", 입금구분: "중도금1", 입금내용: "중도금1", 입금자: "customer" },
  중도금2: { 입출금: "입금", 입금구분: "중도금2", 입금내용: "중도금2", 입금자: "customer" },
  중도금3: { 입출금: "입금", 입금구분: "중도금3", 입금내용: "중도금3", 입금자: "customer" },
  잔금1: { 입출금: "입금", 입금구분: "잔금1", 입금내용: "잔금1", 입금자: "customer" },
  잔금2: { 입출금: "입금", 입금구분: "잔금2", 입금내용: "잔금2", 입금자: "customer" },
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
 * 영수증(현금영수증 컬럼: CASH_RECEIPT_OPTIONS 중 하나)은 등록 시 필수, 수정 시 고르지 않으면 기존 값을 유지한다.
 * 발급불필요는 세부 사유를 받아 비고(A/S) 맨 끝 줄에 붙인다.
 */
export type DepositInput = {
  현장번호: string;
  고객명: string;
  영업사원: string;
  /** 한샘물대 / 한샘시공비 / 한샘 외 시공비 / 거래처환불 */
  구분: string;
  /** 입금 / 출금. 입금구분 규칙에 입출금이 정해져 있지 않을 때(홈씨씨창호)만 사용 (필수) */
  입출금: string;
  입금액: string;
  날짜: string; // YYYY-MM-DD
  /** 구분이 '한샘 외 시공비'·'거래처환불'일 때만 사용 */
  입금내용: string;
  /** 구분이 '거래처환불'일 때 입금자로 저장 */
  거래처: string;
  /** 영수증 (CASH_RECEIPT_OPTIONS 중 하나). 등록 시 필수, 수정 시 ""이면 기존 값 유지 */
  현금영수증: string;
  /** 현금영수증이 발급불필요일 때 세부 사유 (필수). 테이블 컬럼이 아니라 비고(A/S) 맨 끝 줄에 붙여 저장 */
  현금영수증사유: string;
  /** A/S 내용 (자유 입력, 선택) */
  "A/S": string;
} & VendorInfo; // 거래처 정보 (선택)

export const AS_MAX_LENGTH = 500;

/** "2026-10-29" → "2026년 10월 29일" (기존 데이터와 같은 형식으로 저장) */
function toKoreanDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * 입금 입력값 검증 + 테이블 저장 형식으로 변환.
 * 입금내역은 모든 컬럼이 text라서 기존 행과 똑같이 금액은 "1,480,000", 날짜는 "2026년 10월 29일"로 저장한다.
 */
export function normalizeDepositInput(
  raw: Partial<Record<keyof DepositInput, unknown>>,
  /** 등록(신규)일 때 true: 현금영수증 필수. 수정은 비워 두면 기존 값 유지 */
  { requireCashReceipt = false }: { requireCashReceipt?: boolean } = {},
): {
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
  // 입출금: 규칙에 정해져 있으면 그 값, 아니면(홈씨씨창호) 화면에서 고른 입금/출금
  const pickedKind = text(raw.입출금);
  const 입출금 = rule ? (rule.입출금 ?? pickedKind) : null;
  if (rule && rule.입출금 === null && !(DEPOSIT_KINDS as readonly (string | null)[]).includes(pickedKind)) {
    errors.push(`${구분}: 입금/출금을 선택하세요`);
  }
  const 거래처 = rule?.입금자 === "vendor" ? text(raw.거래처) : null;
  if (rule?.입금자 === "vendor" && !거래처) errors.push(`${구분}: 거래처를 입력하세요`);

  const 현금영수증 = text(raw.현금영수증);
  if (현금영수증 ? !(CASH_RECEIPT_OPTIONS as readonly string[]).includes(현금영수증) : requireCashReceipt) {
    errors.push(`영수증은 ${CASH_RECEIPT_OPTIONS.join(", ")} 중에서 선택하세요`);
  }

  const note = text(raw["A/S"]);
  if (note && note.length > AS_MAX_LENGTH) errors.push(`비고는 ${AS_MAX_LENGTH}자 이내로 입력하세요`);
  // 발급불필요: 세부 사유(필수)를 비고 맨 끝 줄에 붙인다
  let as = note;
  // (수정 화면에서 '기존 값 유지'를 고른 기존 발급불필요 행도 사유가 오면 그대로 다시 붙인다)
  if (현금영수증 === CASH_RECEIPT_NOT_NEEDED || (!현금영수증 && text(raw.현금영수증사유))) {
    const reason = text(raw.현금영수증사유)?.replace(/\s*\n\s*/g, " ") ?? null;
    if (!reason) errors.push("영수증 발급불필요 사유를 입력하세요");
    else if (reason.length > CASH_RECEIPT_REASON_MAX_LENGTH) {
      errors.push(`영수증 발급불필요 사유는 ${CASH_RECEIPT_REASON_MAX_LENGTH}자 이내로 입력하세요`);
    } else {
      as = [note, `${CASH_RECEIPT_REASON_PREFIX}${reason}`].filter(Boolean).join("\n");
    }
  }

  // 거래처 정보 (선택). 공정별거래처에서 고른 값을 그대로 저장한다 (입력한 경우에만 저장)
  const vendor = Object.fromEntries(VENDOR_INFO_COLUMNS.map((c) => [c, text(raw[c])])) as Record<VendorInfoKey, string | null>;
  for (const c of VENDOR_INFO_COLUMNS) {
    if ((vendor[c]?.length ?? 0) > VENDOR_INFO_MAX_LENGTH) errors.push(`${c}은(는) ${VENDOR_INFO_MAX_LENGTH}자 이내여야 합니다`);
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
      입출금,
      입금자: 거래처, // 거래처환불은 입력한 거래처명, 그 외는 서버에서 입금구분에 따라 채움
      입금내용,
      입금처: null,
      입금구분: rule?.입금구분 ?? null,
      날짜: dateIso ? toKoreanDate(dateIso) : null,
      현금영수증, // 비어 있으면 수정 시 서버에서 기존 값 유지
      비고: null,
      "A/S": as,
      ...vendor,
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

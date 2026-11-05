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

export type Deposit = DepositRow & {
  /** 날짜를 YYYY-MM-DD로 해석한 값 (해석 불가 시 null, 원문은 `날짜`) */
  dateIso: string | null;
  /** 입금액을 숫자로 해석한 값 (해석 불가 시 null, 원문은 `입금액`) */
  amount: number | null;
};

export function toDeposit(row: DepositRow): Deposit {
  return {
    ...row,
    dateIso: toIsoDate(row.날짜) ?? null,
    amount: toMoney(row.입금액) ?? null,
  };
}

/** 최신 날짜 먼저, 날짜를 모르는 행은 맨 뒤 */
export function sortDepositsDesc(rows: Deposit[]): Deposit[] {
  return [...rows].sort((a, b) =>
    a.dateIso === null || b.dateIso === null ? compareDeposits(a, b) : compareDeposits(b, a),
  );
}

export const DEPOSIT_KINDS = ["입금", "출금"] as const;

/** 입금 등록 시 선택 가능한 입금구분 */
export const DEPOSIT_TYPES = ["한샘", "시공비", "거래처환불입금"] as const;

/** 입력 폼에서 받는 값 */
export type DepositInput = {
  현장번호: string;
  고객명: string;
  영업사원: string;
  계약가: string;
  입출금: string;
  입금액: string;
  날짜: string; // YYYY-MM-DD
  입금자: string;
  입금내용: string;
  입금처: string;
  입금구분: string;
  현금영수증: string;
  비고: string;
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

  const 입출금 = text(raw.입출금);
  if (!입출금 || !(DEPOSIT_KINDS as readonly string[]).includes(입출금)) errors.push("입금/출금을 선택하세요");

  const amount = toMoney(raw.입금액);
  if (amount === null) errors.push("금액을 입력하세요");
  else if (amount === undefined || amount <= 0) errors.push("금액은 0보다 큰 숫자여야 합니다");

  const dateIso = toIsoDate(raw.날짜);
  if (dateIso === null) errors.push("날짜를 입력하세요");
  else if (dateIso === undefined) errors.push("날짜 형식이 올바르지 않습니다");

  const 입금구분 = text(raw.입금구분);
  if (!입금구분) errors.push("입금구분을 선택하세요");
  else if (!(DEPOSIT_TYPES as readonly string[]).includes(입금구분)) {
    errors.push(`입금구분은 ${DEPOSIT_TYPES.join(", ")} 중 하나여야 합니다`);
  }

  const contract = toMoney(raw.계약가);
  if (contract === undefined) errors.push("계약가는 숫자여야 합니다");

  return {
    errors,
    data: {
      현장번호,
      고객명: text(raw.고객명),
      영업사원: text(raw.영업사원),
      계약가: typeof contract === "number" ? formatMoney(contract) : null,
      입금액: typeof amount === "number" ? formatMoney(amount) : null,
      입출금,
      입금자: text(raw.입금자),
      입금내용: text(raw.입금내용),
      입금처: text(raw.입금처),
      입금구분,
      날짜: dateIso ? toKoreanDate(dateIso) : null,
      현금영수증: text(raw.현금영수증),
      비고: text(raw.비고),
    },
  };
}

/** 날짜 오름차순, 날짜를 모르는 행은 맨 뒤 */
export function compareDeposits(a: Deposit, b: Deposit) {
  if (a.dateIso === b.dateIso) return 0;
  if (a.dateIso === null) return 1;
  if (b.dateIso === null) return -1;
  return a.dateIso < b.dateIso ? -1 : 1;
}

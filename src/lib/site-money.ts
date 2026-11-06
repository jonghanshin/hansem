// 현장별 계약 금액(시공비·한샘·홈씨씨)과 실제 입금·출금 집계 (현장 상세의 입금내역, 대시보드 공용)

import { depositCategoryOf, type Deposit, type DepositCategory } from "@/lib/deposits";
import type { SiteInput } from "@/lib/sites";

export type ContractAmounts = Pick<SiteInput, "계약가" | "시공비" | "한샘상품가액" | "홈씨씨상품가액">;

/**
 * 계약 금액 항목 ↔ 그 항목으로 보는 입금구분. 입금과 출금을 따로 합산한다.
 * 시공비의 출금은 '한샘 외 시공비'(거래처 지급). 거래처환불·예전 형식 구분은 넣지 않는다.
 */
export const MONEY_GROUPS = [
  {
    label: "시공비",
    key: "시공비",
    categories: [
      "계약금1", "계약금2", "착수금1", "착수금2", "중도금1", "중도금2", "중도금3", "잔금1", "잔금2",
      "한샘 외 시공비",
    ],
  },
  { label: "한샘", key: "한샘상품가액", categories: ["한샘물대", "한샘시공비"] },
  { label: "홈씨씨", key: "홈씨씨상품가액", categories: ["홈씨씨창호"] },
] as const satisfies readonly { label: string; key: keyof ContractAmounts; categories: readonly DepositCategory[] }[];

export const MONEY_GROUP_NOTE =
  "시공비 = 계약금·착수금·중도금·잔금(입금), 한샘 외 시공비(출금) · 한샘 = 한샘물대·한샘시공비 · 홈씨씨 = 홈씨씨창호. 거래처환불은 제외.";

export type MoneyGroupSummary = {
  label: string;
  /** 계약 금액 (현장정보에 저장된 값, 없으면 null) */
  planned: number | null;
  paidIn: number;
  paidOut: number;
};

function sum(rows: Deposit[]) {
  return rows.reduce((acc, d) => acc + (d.amount ?? 0), 0);
}

/** 한 현장의 시공비·한샘·홈씨씨별 계약 / 입금 / 출금 */
export function summarizeSiteMoney(contract: ContractAmounts, deposits: Deposit[]): MoneyGroupSummary[] {
  return MONEY_GROUPS.map((g) => {
    const mine = deposits.filter((d) => (g.categories as readonly (string | null)[]).includes(depositCategoryOf(d)));
    return {
      label: g.label,
      planned: contract[g.key],
      paidIn: sum(mine.filter((d) => d.입출금 === "입금")),
      paidOut: sum(mine.filter((d) => d.입출금 === "출금")),
    };
  });
}

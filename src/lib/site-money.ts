// 현장별 계약 금액(시공비·한샘·홈씨씨)과 실제 입금·출금 집계 (현장 상세의 입금내역, 대시보드 공용)

import { CONSTRUCTION_TYPE, depositCategoryOf, type Deposit, type DepositCategory } from "@/lib/deposits";
import type { SiteInput } from "@/lib/sites";

export type ContractAmounts = Pick<SiteInput, "계약가" | "시공비" | "한샘상품가액" | "홈씨씨상품가액">;

/** 계약 금액 항목: 화면 라벨 ↔ 현장정보 컬럼 */
export const MONEY_GROUPS = [
  { label: "나비", key: "시공비" },
  { label: "한샘", key: "한샘상품가액" },
  { label: "홈씨씨", key: "홈씨씨상품가액" },
] as const satisfies readonly { label: string; key: keyof ContractAmounts }[];

/**
 * 대시보드·현장 상세의 나비 / 한샘 / 홈씨씨 입금·출금 집계 기준.
 * 홈씨씨 = 홈씨씨창호, 나비 = 나비계약금·나비착수금·나비중도금·나비잔금 + 한샘 외 시공비 출금, 한샘 = 그 외 전부.
 */
const NABI_CATEGORIES: readonly DepositCategory[] = ["나비계약금", "나비착수금", "나비중도금", "나비잔금"];
type MoneyGroupLabel = (typeof MONEY_GROUPS)[number]["label"];

export function moneyGroupOf(d: Deposit): MoneyGroupLabel {
  const category = depositCategoryOf(d);
  if (category === "홈씨씨창호") return "홈씨씨";
  if (category && NABI_CATEGORIES.includes(category)) return "나비";
  if (category === CONSTRUCTION_TYPE && d.입출금 === "출금") return "나비";
  return "한샘";
}

export const MONEY_GROUP_NOTE =
  "나비 = 나비계약금·나비착수금·나비중도금·나비잔금(입금), 한샘 외 시공비(출금) · 홈씨씨 = 홈씨씨창호 · 한샘 = 그 외 입금구분 전부.";

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
    const mine = deposits.filter((d) => moneyGroupOf(d) === g.label);
    return {
      label: g.label,
      planned: contract[g.key],
      paidIn: sum(mine.filter((d) => d.입출금 === "입금")),
      paidOut: sum(mine.filter((d) => d.입출금 === "출금")),
    };
  });
}

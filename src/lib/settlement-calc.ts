// 정산 금액 계산: 화면 표시와 서버 저장(정산정보)이 같은 식을 쓰도록 한 곳에 둔다 (DB 접근 없음)

import type { SettlementDeposit, SettlementLine } from "@/lib/settlement";
import { withoutVat } from "@/lib/sites";

export type OutflowGroup = "한샘" | "홈씨씨" | "시공비포함" | "시공비미포함" | "기타";

export const MAIN_OUTFLOW_GROUPS = ["홈씨씨", "시공비"];
const VAT_EXCLUDED = "미포함";
/** 정산대상금액 계산 시 이익금액 합계에서 빼는 공제금 */
export const DEDUCTION = 2_500_000;

export const rowsSum = (rows: SettlementDeposit[]) => rows.reduce((acc, r) => acc + (r.금액 ?? 0), 0);

export function outflowRows(line: SettlementLine, group: OutflowGroup) {
  return line.출금내역.filter((r) => {
    if (group === "기타") return !MAIN_OUTFLOW_GROUPS.includes(r.묶음);
    if (group !== "시공비포함" && group !== "시공비미포함") return r.묶음 === group;
    // 부가세포함 값이 없는 예전 내역은 입력 기본값과 같이 포함으로 본다
    return r.묶음 === "시공비" && (r.부가세포함 === VAT_EXCLUDED) === (group === "시공비미포함");
  });
}

/** 총출금액의 구성: 한샘(부가세 포함 공급가)·홈씨씨·시공비(한샘외, 부가세 포함/미포함)·기타 */
export function outflowParts(line: SettlementLine) {
  return {
    // 예전에 저장한 정산결과는 현장별 추가시공비를 한샘 금액에 포함했다 (지금은 없음 → 0)
    한샘: line.한샘["공급가(부가세포함)"] + (line.한샘.추가시공비 ?? 0),
    홈씨씨: rowsSum(outflowRows(line, "홈씨씨")),
    시공비포함: rowsSum(outflowRows(line, "시공비포함")),
    시공비미포함: rowsSum(outflowRows(line, "시공비미포함")),
    기타: rowsSum(outflowRows(line, "기타")),
  };
}

/** 정산결과 표의 금액: 부가세가 포함된 한샘·홈씨씨·시공비는 부가세를 뺀다 */
export function netOutflowParts(line: SettlementLine) {
  const parts = outflowParts(line);
  return {
    ...parts,
    한샘: withoutVat(parts.한샘),
    홈씨씨: withoutVat(parts.홈씨씨),
    시공비포함: withoutVat(parts.시공비포함),
  };
}

/** 이익금액: 계약금(부가세제외) - 부가세 제외 총출금액. 계약금이 없으면 null */
export function netProfit(line: SettlementLine) {
  if (line.계약금 === null) return null;
  return withoutVat(line.계약금) - Object.values(netOutflowParts(line)).reduce((a, b) => a + b, 0);
}

/** 구간별 근로자 비율(%): 500만원 이하, 500만원 초과 1,000만원 이하, 1,000만원 초과 (권한 테이블의 500이하·1000이하·1000초과) */
export type WorkerRates = { upTo5m: number; upTo10m: number; over10m: number };

/** 권한에 비율이 없을 때 쓰는 기본 비율 */
export const DEFAULT_WORKER_RATES: WorkerRates = { upTo5m: 30, upTo10m: 35, over10m: 40 };

/** 정산금액: 정산대상금액을 구간별 근로자 비율로 누진 계산 */
export function workerShare(amount: number, rates: WorkerRates = DEFAULT_WORKER_RATES) {
  const tier1 = Math.min(amount, 5_000_000);
  const tier2 = Math.max(Math.min(amount, 10_000_000) - 5_000_000, 0);
  const tier3 = Math.max(amount - 10_000_000, 0);
  return Math.round((tier1 * rates.upTo5m + tier2 * rates.upTo10m + tier3 * rates.over10m) / 100);
}

/** 정산금액 계산 과정의 한 구간: 구간에 해당하는 금액 × 근로자 비율 */
export type WorkerShareTier = { label: string; base: number; rate: number; amount: number };

/** 정산금액의 구간별 계산 과정 (화면 설명용). 구간 금액은 원 단위 반올림이라 합이 정산금액과 1원 정도 다를 수 있다 */
export function workerShareBreakdown(amount: number, rates: WorkerRates = DEFAULT_WORKER_RATES): WorkerShareTier[] {
  const value = Math.max(amount, 0);
  const tiers: [string, number, number][] = [
    ["500만원 이하", Math.min(value, 5_000_000), rates.upTo5m],
    ["500만원 초과 1,000만원 이하", Math.max(Math.min(value, 10_000_000) - 5_000_000, 0), rates.upTo10m],
    ["1,000만원 초과", Math.max(value - 10_000_000, 0), rates.over10m],
  ];
  return tiers.map(([label, base, rate]) => ({ label, base, rate, amount: Math.round((base * rate) / 100) }));
}

export type SettlementSummaryValues = {
  /** 이익금액 합계 */
  profit: number;
  /** 정산대상금액 = 이익금액 합계 - 공제금 - 추가시공비(부가세제외) - 전달 누적이월금 */
  target: number;
  /** 정산대상금액이 0 이상일 때의 정산금액(근로자 몫), 아니면 0 */
  settlement: number;
  /** 정산대상금액이 음수일 때의 이월금액(양수, 새 누적이월금), 아니면 0 */
  carryOver: number;
  /** 세후 정산금액 (정산금액 - 세금). 세율이 정해지기 전(SETTLEMENT_TAX_RATE = null)에는 0. 정산정보.정산금에 저장한다 */
  afterTax: number;
};

/**
 * 정산금액에 매기는 세율 (%). 아직 정해지지 않아 null이고, 그동안 세후 정산금액은 0으로 표시·저장한다.
 * 세율이 정해지면 이 값만 바꾸면 화면·저장·급여명세서 성과급이 모두 그 세율로 계산된다 (예: 3.3).
 */
export const SETTLEMENT_TAX_RATE: number | null = null;

/** 세후 정산금액 = 정산금액 - 원 단위 반올림한 세금 (세율이 없으면 0) */
export function afterTaxAmount(settlement: number, taxRate: number | null = SETTLEMENT_TAX_RATE): number {
  if (taxRate === null || settlement <= 0) return 0;
  return settlement - Math.round((settlement * taxRate) / 100);
}

/** 정산대상금액에서 빼는 추가시공비: 이익금액과 같이 부가세 제외 금액으로 뺀다 */
export function extraCostDeduction(extraCost: { 합계: number } | null | undefined) {
  return extraCost ? withoutVat(extraCost.합계) : 0;
}

export function summarizeSettlement(
  lines: SettlementLine[],
  carryIn = 0,
  rates: WorkerRates = DEFAULT_WORKER_RATES,
  extraCost: { 합계: number } | null = null,
): SettlementSummaryValues {
  const profit = lines.reduce((acc, l) => acc + (netProfit(l) ?? 0), 0);
  const target = profit - DEDUCTION - extraCostDeduction(extraCost) - carryIn;
  const settlement = target >= 0 ? workerShare(target, rates) : 0;
  return {
    profit,
    target,
    settlement,
    carryOver: target < 0 ? -target : 0,
    afterTax: afterTaxAmount(settlement),
  };
}

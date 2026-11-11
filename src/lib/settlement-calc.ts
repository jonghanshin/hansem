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

/** 총출금액의 구성: 한샘(부가세 포함 공급가+추가시공비)·홈씨씨·시공비(한샘외, 부가세 포함/미포함)·기타 */
export function outflowParts(line: SettlementLine) {
  return {
    한샘: line.한샘["공급가(부가세포함)"] + line.한샘.추가시공비,
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

export type SettlementSummaryValues = {
  /** 이익금액 합계 */
  profit: number;
  /** 정산대상금액 = 이익금액 합계 - 공제금 - 전달 누적이월금 */
  target: number;
  /** 정산대상금액이 0 이상일 때의 정산금액(근로자 몫), 아니면 0 */
  settlement: number;
  /** 정산대상금액이 음수일 때의 이월금액(양수, 새 누적이월금), 아니면 0 */
  carryOver: number;
};

export function summarizeSettlement(
  lines: SettlementLine[],
  carryIn = 0,
  rates: WorkerRates = DEFAULT_WORKER_RATES,
): SettlementSummaryValues {
  const profit = lines.reduce((acc, l) => acc + (netProfit(l) ?? 0), 0);
  const target = profit - DEDUCTION - carryIn;
  return {
    profit,
    target,
    settlement: target >= 0 ? workerShare(target, rates) : 0,
    carryOver: target < 0 ? -target : 0,
  };
}

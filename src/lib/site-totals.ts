import "server-only";

import {
  toIsoDate,
  toMoney,
  type ComputedFieldKey,
  type ComputedSources,
  type ConstructionCostLine,
  type HansemOrderLine,
  type Site,
  type SiteInput,
} from "@/lib/sites";
import { CONSTRUCTION_TYPE, REFUND_TYPE } from "@/lib/deposits";
import { DEPOSITS_TABLE, getSupabaseAdmin, HANSEM_ORDERS_TABLE, SITES_TABLE } from "@/lib/supabase-admin";

export type SiteTotals = Record<ComputedFieldKey, number>;

// 한샘주문진도정보 공급가 컬럼 → 현장정보 필드
const ORDER_COLUMN: Record<"한샘공급가합계" | "한샘물대" | "한샘시공비", "공급가" | "공급가(HS)" | "공급가(S1)"> = {
  한샘공급가합계: "공급가",
  한샘물대: "공급가(HS)",
  한샘시공비: "공급가(S1)",
};

type SourceRows = {
  orders: Record<string, unknown>[];
  deposits: Record<string, unknown>[]; // 입금구분 '한샘 외 시공비'
  refunds: Record<string, unknown>[]; // 입금구분 '거래처환불'
};


/** 계산 근거 원본 행: 확정된 한샘 주문, 입금구분 '한샘 외 시공비' / '거래처환불' 입금내역 */
async function fetchSourceRows(siteNumber: string): Promise<SourceRows> {
  const sb = getSupabaseAdmin();
  // 컬럼명에 괄호가 있어("공급가(HS)") select 목록에 쓸 수 없으므로 * 로 읽는다.
  const [orders, deposits] = await Promise.all([
    sb
      .from(HANSEM_ORDERS_TABLE)
      .select("*")
      .eq("계약현장번호", siteNumber)
      .eq("주문상태", "확정")
      .order("주문번호", { ascending: true }),
    sb.from(DEPOSITS_TABLE).select("*").eq("현장번호", siteNumber).in("입금구분", [CONSTRUCTION_TYPE, REFUND_TYPE]),
  ]);
  if (orders.error) throw new Error(`한샘주문진도정보 조회 실패: ${orders.error.message}`);
  if (deposits.error) throw new Error(`입금내역 조회 실패: ${deposits.error.message}`);
  return {
    orders: orders.data,
    deposits: deposits.data.filter((r) => r.입금구분 === CONSTRUCTION_TYPE),
    refunds: deposits.data.filter((r) => r.입금구분 === REFUND_TYPE),
  };
}

/** 텍스트 금액("3,928,790")들을 더한다. 숫자로 읽을 수 없는 값은 합계에서 빼고 경고로 알린다. */
function sumAmounts(values: unknown[], label: string, warnings: string[]): number {
  let total = 0;
  for (const v of values) {
    const n = toMoney(v);
    if (n === undefined) warnings.push(`${label}: 숫자가 아닌 값 "${String(v)}"은(는) 합계에서 제외했습니다`);
    else if (n !== null) total += n;
  }
  return total;
}

function totalsFrom(rows: SourceRows): { totals: SiteTotals; warnings: string[] } {
  const warnings: string[] = [];
  const totals = {} as SiteTotals;
  for (const [field, column] of Object.entries(ORDER_COLUMN) as [keyof typeof ORDER_COLUMN, string][]) {
    totals[field] = sumAmounts(
      rows.orders.map((r) => r[column]),
      `한샘주문진도정보.${column}`,
      warnings,
    );
  }
  totals.한샘시공비외 = sumAmounts(
    rows.deposits.map((r) => r.입금액),
    "입금내역.입금액",
    warnings,
  );
  totals.환불금액 = sumAmounts(
    rows.refunds.map((r) => r.입금액),
    "입금내역.입금액(환불)",
    warnings,
  );
  return { totals, warnings };
}

export async function computeSiteTotals(siteNumber: string): Promise<{ totals: SiteTotals; warnings: string[] }> {
  return totalsFrom(await fetchSourceRows(siteNumber));
}

function toCostLines(rows: Record<string, unknown>[]): ConstructionCostLine[] {
  const lines = rows.map((r) => ({
    날짜: toIsoDate(r.날짜) ?? text(r.날짜),
    입출금: text(r.입출금),
    입금액: money(r.입금액),
    입금자: text(r.입금자),
    입금내용: text(r.입금내용),
    입금처: text(r.입금처),
  }));
  return lines.sort((a, b) => (a.날짜 ?? "").localeCompare(b.날짜 ?? ""));
}

const text = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const money = (v: unknown) => toMoney(v) ?? null;

/** 자동 계산 필드 하나의 근거 행 목록 (합계는 계산과 같은 규칙으로 다시 더한 값) */
export async function fetchComputedSources(siteNumber: string, field: ComputedFieldKey): Promise<ComputedSources> {
  const rows = await fetchSourceRows(siteNumber);
  const { totals } = totalsFrom(rows);

  if (field === "한샘시공비외") {
    return { kind: "deposits", rows: toCostLines(rows.deposits), total: totals.한샘시공비외 };
  }
  if (field === "환불금액") {
    return { kind: "deposits", rows: toCostLines(rows.refunds), total: totals.환불금액 };
  }

  const lines: HansemOrderLine[] = rows.orders.map((r) => ({
    주문번호: typeof r.주문번호 === "number" ? r.주문번호 : null,
    주문등록일: text(r.주문등록일),
    공정: text(r.공정),
    품목명: text(r.품목명),
    시공일: text(r.시공일),
    공급가: money(r["공급가"]),
    "공급가(HS)": money(r["공급가(HS)"]),
    "공급가(S1)": money(r["공급가(S1)"]),
  }));
  return { kind: "orders", column: ORDER_COLUMN[field], rows: lines, total: totals[field] };
}

/** 현장의 자동 계산 필드를 다시 계산하고, 값이 바뀌었으면 현장정보 테이블을 갱신한다. */
export async function syncSiteTotals(site: Site): Promise<{ site: Site; warnings: string[] }> {
  if (!site.현장번호) return { site, warnings: [] };
  const { totals, warnings } = await computeSiteTotals(site.현장번호);

  const changed = (Object.keys(totals) as ComputedFieldKey[]).some((k) => site[k] !== totals[k]);
  if (!changed) return { site, warnings };

  const { data, error } = await getSupabaseAdmin()
    .from(SITES_TABLE)
    .update(totals satisfies Partial<SiteInput>)
    .eq("id", site.id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`자동 계산 값 저장 실패: ${error.message}`);
  return { site: (data as Site | null) ?? { ...site, ...totals }, warnings };
}

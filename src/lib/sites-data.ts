import "server-only";

import { applyScope, type DataScope } from "@/lib/data-scope";
import { compareDeposits, sortDepositsDesc, toDeposit, type Deposit, type DepositRecord } from "@/lib/deposits";
import type { Site, SiteSummary } from "@/lib/sites";
import { DEPOSITS_TABLE, getSupabaseAdmin, SITES_TABLE } from "@/lib/supabase-admin";

// Supabase(PostgREST)는 한 번의 요청에 최대 1000행만 돌려준다.
// 목록 화면은 전체 데이터로 검색/합계를 내므로 1000행씩 나눠 끝까지 읽는다.
const CHUNK = 1000;

async function fetchAllRows<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await query(from, from + CHUNK - 1);
    if (error) throw new Error(`${label} 조회 실패: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < CHUNK) return rows;
  }
}

export async function fetchSites(scope: DataScope): Promise<Site[]> {
  return fetchAllRows<Site>("현장정보", (from, to) =>
    applyScope(getSupabaseAdmin().from(SITES_TABLE).select("*"), scope)
      .order("id", { ascending: false })
      .range(from, to),
  );
}

export async function fetchDeposits(siteNumber: string, scope: DataScope): Promise<Deposit[]> {
  const { data, error } = await applyScope(
    getSupabaseAdmin().from(DEPOSITS_TABLE).select("*").eq("현장번호", siteNumber),
    scope,
  );
  if (error) throw new Error(`입금내역 조회 실패: ${error.message}`);
  return (data as DepositRecord[]).map(toDeposit).sort(compareDeposits);
}

/** 전체 입금내역 (최신 날짜 먼저, 날짜 해석 불가 행은 맨 뒤) */
export async function fetchAllDeposits(scope: DataScope): Promise<Deposit[]> {
  // 입금내역에는 고유 id가 없어, 나눠 읽는 동안 순서가 흔들리지 않도록 여러 컬럼으로 정렬한다.
  const rows = await fetchAllRows<DepositRecord>("입금내역", (from, to) =>
    applyScope(getSupabaseAdmin().from(DEPOSITS_TABLE).select("*"), scope)
      .order("날짜")
      .order("현장번호")
      .order("입출금")
      .order("입금액")
      .order("입금내용")
      .order("입금자")
      .range(from, to),
  );
  return sortDepositsDesc(rows.map(toDeposit));
}

export async function fetchSiteSummaries(scope: DataScope): Promise<SiteSummary[]> {
  const rows = await fetchAllRows<Site>("현장 목록", (from, to) =>
    applyScope(getSupabaseAdmin().from(SITES_TABLE).select("*"), scope)
      .not("현장번호", "is", null)
      .order("id", { ascending: false })
      .range(from, to),
  );
  return rows.map(({ 현장번호, 고객명, 영업사원, 계약가, 완료일 }) => ({ 현장번호, 고객명, 영업사원, 계약가, 완료일 }));
}

/** 범위 내에 해당 현장번호의 현장이 있는지 (다른 영업사원 현장의 근거 내역 조회 차단용) */
export async function siteNumberInScope(siteNumber: string, scope: DataScope): Promise<boolean> {
  if (scope.salesName == null && !scope.hidePrivateSites) return true;
  const { count, error } = await applyScope(
    getSupabaseAdmin().from(SITES_TABLE).select("id", { count: "exact", head: true }).eq("현장번호", siteNumber),
    scope,
  );
  if (error) throw new Error(`현장정보 조회 실패: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function fetchExistingSiteNumbers(numbers: string[]): Promise<Set<string>> {
  if (numbers.length === 0) return new Set();
  const { data, error } = await getSupabaseAdmin()
    .from(SITES_TABLE)
    .select("현장번호")
    .in("현장번호", numbers);
  if (error) throw new Error(`현장번호 중복 확인 실패: ${error.message}`);
  // supabase-js의 select 타입 파서가 한글 컬럼명을 처리하지 못해 unknown을 거쳐 캐스팅한다.
  return new Set((data as unknown as { 현장번호: string }[]).map((r) => r.현장번호));
}

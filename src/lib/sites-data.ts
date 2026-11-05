import "server-only";

import { compareDeposits, sortDepositsDesc, toDeposit, type Deposit, type DepositRow } from "@/lib/deposits";
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

export async function fetchSites(): Promise<Site[]> {
  return fetchAllRows<Site>("현장정보", (from, to) =>
    getSupabaseAdmin().from(SITES_TABLE).select("*").order("id", { ascending: false }).range(from, to),
  );
}

export async function fetchDeposits(siteNumber: string): Promise<Deposit[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(DEPOSITS_TABLE)
    .select("*")
    .eq("현장번호", siteNumber);
  if (error) throw new Error(`입금내역 조회 실패: ${error.message}`);
  return (data as DepositRow[]).map(toDeposit).sort(compareDeposits);
}

/** 전체 입금내역 (최신 날짜 먼저, 날짜 해석 불가 행은 맨 뒤) */
export async function fetchAllDeposits(): Promise<Deposit[]> {
  // 입금내역에는 고유 id가 없어, 나눠 읽는 동안 순서가 흔들리지 않도록 여러 컬럼으로 정렬한다.
  const rows = await fetchAllRows<DepositRow>("입금내역", (from, to) =>
    getSupabaseAdmin()
      .from(DEPOSITS_TABLE)
      .select("*")
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

export async function fetchSiteSummaries(): Promise<SiteSummary[]> {
  const rows = await fetchAllRows<Site>("현장 목록", (from, to) =>
    getSupabaseAdmin()
      .from(SITES_TABLE)
      .select("*")
      .not("현장번호", "is", null)
      .order("id", { ascending: false })
      .range(from, to),
  );
  return rows.map(({ 현장번호, 고객명, 영업사원, 계약가 }) => ({ 현장번호, 고객명, 영업사원, 계약가 }));
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

import "server-only";

import { RESTRICTED_ROLE } from "@/lib/data-scope";
import { DEFAULT_WORKER_RATES, type WorkerRates } from "@/lib/settlement-calc";
import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

// 정산에 쓰는 영업사원의 권한 정보와 구간별 근로자 비율 (권한."500이하"·"1000이하"·"1000초과")

export type SettlementAccount = {
  id: number;
  영업사원ID: string | null;
  이름: string | null;
  역할: string | null;
  정산시작월: string | null;
  초기화여부: string | null;
  "500이하": string | null;
  "1000이하": string | null;
  "1000초과": string | null;
};

/** 비율 구간 → 권한 테이블 컬럼 */
const RATE_COLUMNS = { upTo5m: "500이하", upTo10m: "1000이하", over10m: "1000초과" } as const satisfies Record<
  keyof WorkerRates,
  keyof SettlementAccount
>;

/** 정산 대상 영업사원의 권한 행: 영업사원ID가 같은 계정, 없으면 이름이 같은 RD */
export async function findSettlementAccount(영업사원ID: string | null, 영업사원: string): Promise<SettlementAccount | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(AUTH_TABLE)
    .select('id, 영업사원ID, 이름, 역할, 정산시작월, 초기화여부, "500이하", "1000이하", "1000초과"');
  if (error) throw new Error(`권한 조회 실패: ${error.message}`);
  const accounts = data as unknown as SettlementAccount[];
  return (
    (영업사원ID && accounts.find((a) => a.영업사원ID?.trim() === 영업사원ID)) ||
    accounts.find((a) => a.이름?.trim() === 영업사원 && a.역할?.trim() === RESTRICTED_ROLE) ||
    null
  );
}

/** 정산에 쓰는 구간별 근로자 비율. 권한에 없거나 숫자가 아닌 구간은 기본 비율을 쓴다 */
export type AppliedRates = WorkerRates & {
  /** 기본 비율을 쓴 구간이 있으면 true */
  usedDefault: boolean;
};

export function ratesOf(account: SettlementAccount | null): AppliedRates {
  let usedDefault = false;
  const read = (value: string | null | undefined, fallback: number) => {
    const n = Number(String(value ?? "").replace(/[%\s]/g, ""));
    if (String(value ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100) return n;
    usedDefault = true;
    return fallback;
  };
  return {
    upTo5m: read(account?.[RATE_COLUMNS.upTo5m], DEFAULT_WORKER_RATES.upTo5m),
    upTo10m: read(account?.[RATE_COLUMNS.upTo10m], DEFAULT_WORKER_RATES.upTo10m),
    over10m: read(account?.[RATE_COLUMNS.over10m], DEFAULT_WORKER_RATES.over10m),
    usedDefault,
  };
}

/** 화면에서 넘어온 근로자 비율 검사 (각 구간 0~100). 맞으면 비율, 아니면 오류 문구 */
export function checkRates(rates: unknown): WorkerRates | string {
  const r = (rates ?? {}) as Partial<Record<keyof WorkerRates, unknown>>;
  const keys = Object.keys(RATE_COLUMNS) as (keyof WorkerRates)[];
  const ok = keys.every((k) => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
  });
  if (!ok) return "구간별 비율은 0~100 사이 숫자로 입력하세요";
  return { upTo5m: r.upTo5m as number, upTo10m: r.upTo10m as number, over10m: r.over10m as number };
}

/** 권한 테이블에 구간별 근로자 비율을 저장한다 (예: "30") */
export async function saveAccountRates(accountId: number, rates: WorkerRates): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(AUTH_TABLE)
    .update({
      [RATE_COLUMNS.upTo5m]: String(rates.upTo5m),
      [RATE_COLUMNS.upTo10m]: String(rates.upTo10m),
      [RATE_COLUMNS.over10m]: String(rates.over10m),
    })
    .eq("id", accountId);
  if (error) throw new Error(`비율 저장 실패: ${error.message}`);
}

/** RD 화면용: 영업사원의 현재 권한 테이블 비율 */
export async function currentRatesFor(영업사원ID: string | null, 영업사원: string): Promise<AppliedRates> {
  return ratesOf(await findSettlementAccount(영업사원ID, 영업사원));
}

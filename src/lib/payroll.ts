import "server-only";

import {
  type BonusPerson,
  type ConfirmedSettlement,
  DEFAULT_BASE,
  matchesPerson,
  normalizeBase,
  normalizeYmd,
  parseSettlementAmount,
  type Payslip,
  type PayrollBase,
  SETTLEMENT_CONFIRMED_VALUES,
} from "@/lib/payroll-shared";
import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

// 급여 기준정보(연도별)와 급여명세서(직원·월별) 조회·저장. 권한 확인은 화면과 Server Action에서 한다.

export const PAYROLL_BASE_TABLE = "급여기준";
export const PAYSLIP_TABLE = "급여명세서";

const PAYSLIP_COLUMNS =
  "id, 사용자, 이름, 귀속월, 직급, 입사일, 부서, 호봉, 지급일, 지급, 공제, 지급액계, 공제액계, 차인지급액, 작성자, 수정일시";

function tableError(label: string, table: string, message: string): Error {
  if (/schema cache|does not exist/i.test(message)) {
    return new Error(`${label} 실패: '${table}' 테이블이 없습니다. doc/급여.sql을 Supabase SQL Editor에서 실행하세요.`);
  }
  return new Error(`${label} 실패: ${message}`);
}

/** bigint 컬럼은 문자열로 올 수 있어 숫자로 맞춘다 */
function toPayslip(row: Record<string, unknown>): Payslip {
  return {
    ...(row as unknown as Payslip),
    id: Number(row.id),
    사용자: Number(row.사용자),
    지급액계: Number(row.지급액계),
    공제액계: Number(row.공제액계),
    차인지급액: Number(row.차인지급액),
  };
}

/** 권한.월급명세가 'Y'인 사용자만 나의정보에서 급여명세서를 본다 (컬럼이 없으면 아무도 못 본다) */
export async function canViewPayslips(uid: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select("월급명세").eq("id", uid).maybeSingle();
  if (error) return false;
  const v = (data as unknown as { 월급명세: string | null } | null)?.월급명세;
  return v?.trim().toUpperCase() === "Y";
}

export type PayrollMember = {
  id: number;
  영업사원ID: string;
  이름: string;
  역할: string;
  /** 권한.직급 원래 값 */
  직급: string | null;
  /** YYYY-MM-DD */
  입사일: string | null;
  월급명세: boolean;
  /** 권한.기본급 (개인 기본급). 비어 있으면 기준정보 기본급 */
  기본급: number | null;
  비고: string;
};

/** 급여 화면용 직원 목록: 권한 테이블의 직급·입사일·월급명세까지 (항상 테이블을 직접 읽는다) */
export async function fetchPayrollMembers(): Promise<PayrollMember[]> {
  const query = (columns: string) => getSupabaseAdmin().from(AUTH_TABLE).select(columns);
  const COLUMNS = "id, 영업사원ID, 이름, 역할, 직급, 입사일, 월급명세, 비고";
  let { data, error } = await query(`${COLUMNS}, 기본급`);
  // 기본급 컬럼이 아직 없으면(doc/급여.sql 미실행) 개인 기본급 없이
  if (error?.code === "42703") ({ data, error } = await query(COLUMNS));
  if (error) throw new Error(`권한 조회 실패: ${error.message}`);
  type Row = {
    id: number;
    영업사원ID: string;
    이름: string | null;
    역할: string | null;
    직급: string | null;
    입사일: string | null;
    월급명세: string | null;
    기본급?: string | number | null;
    비고: string | null;
  };
  return (data as unknown as Row[]).map((r) => ({
    id: Number(r.id),
    영업사원ID: String(r.영업사원ID ?? "").trim(),
    이름: r.이름?.trim() || r.영업사원ID,
    역할: r.역할?.trim() ?? "",
    직급: r.직급?.trim() || null,
    입사일: normalizeYmd(r.입사일),
    월급명세: r.월급명세?.trim().toUpperCase() === "Y",
    기본급: personalBasePay(r.기본급),
    비고: r.비고?.trim() ?? "",
  }));
}

// ---------- 성과급 (정산정보) ----------

const SETTLEMENT_INFO_TABLE = "정산정보";

/**
 * 확정된 정산정보(확정여부 = 'Y')의 정산금. 명세서 귀속월의 한 달 전 정산월을 찾는다.
 * settleMonths: 찾을 정산월(YYYY-MM) 목록. people이 있으면 그 사람들 것만
 */
export async function fetchConfirmedSettlements(
  settleMonths: readonly string[],
  people?: readonly BonusPerson[],
): Promise<ConfirmedSettlement[]> {
  if (settleMonths.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from(SETTLEMENT_INFO_TABLE)
    .select("id, 영업사원, 영업사원ID, 정산월, 정산금, 확정여부")
    .in("정산월", [...new Set(settleMonths)])
    .in("확정여부", [...SETTLEMENT_CONFIRMED_VALUES])
    .order("id", { ascending: false });
  if (error) throw new Error(`정산정보 조회 실패: ${error.message}`);
  type Row = { 영업사원: string | null; 영업사원ID: string | null; 정산월: string; 정산금: string | number | null };
  const rows = (data as unknown as Row[]).map((r) => ({
    영업사원: r.영업사원?.trim() ?? "",
    영업사원ID: r.영업사원ID == null ? "" : String(r.영업사원ID).trim(),
    정산월: r.정산월,
    정산금: parseSettlementAmount(r.정산금),
  }));
  if (!people) return rows;
  return rows.filter((r) => people.some((p) => matchesPerson(r, p)));
}

/** 성과급 상세용: 확정된 정산정보 한 건과 저장 당시 정산결과(결과 JSON). 없으면 null */
export async function fetchConfirmedSettlementDetail(
  settleMonth: string,
  person: BonusPerson,
): Promise<(ConfirmedSettlement & { 결과: unknown }) | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(SETTLEMENT_INFO_TABLE)
    .select("id, 영업사원, 영업사원ID, 정산월, 정산금, 결과")
    .eq("정산월", settleMonth)
    .in("확정여부", [...SETTLEMENT_CONFIRMED_VALUES])
    .order("id", { ascending: false });
  if (error) throw new Error(`정산정보 조회 실패: ${error.message}`);
  type Row = { 영업사원: string | null; 영업사원ID: string | null; 정산월: string; 정산금: string | null; 결과: unknown };
  const row = (data as unknown as Row[])
    .map((r) => ({
      영업사원: r.영업사원?.trim() ?? "",
      영업사원ID: r.영업사원ID == null ? "" : String(r.영업사원ID).trim(),
      정산월: r.정산월,
      정산금: parseSettlementAmount(r.정산금),
      결과: r.결과,
    }))
    .find((r) => matchesPerson(r, person));
  return row ?? null;
}

/** 권한.기본급 → 원 (비어 있거나 숫자가 아니면 null) */
function personalBasePay(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원]/g, ""));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export type ResolvedBase = {
  base: PayrollBase;
  /** 기준정보를 저장한 연도 (해당 연도가 없으면 그 이전 가장 가까운 연도, 하나도 없으면 null = 기본값) */
  sourceYear: number | null;
  수정자: string | null;
  수정일시: string | null;
};

/** 그 연도의 기준정보. 저장하지 않은 연도면 이전 연도 값(없으면 기본값)을 쓴다 */
export async function fetchPayrollBase(year: number): Promise<ResolvedBase> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAYROLL_BASE_TABLE)
    .select("연도, 기준, 수정자, 수정일시")
    .lte("연도", year)
    .order("연도", { ascending: false })
    .limit(1);
  if (error) throw tableError("급여 기준정보 조회", PAYROLL_BASE_TABLE, error.message);
  const row = (data as unknown as { 연도: number; 기준: unknown; 수정자: string | null; 수정일시: string }[])[0];
  if (!row) return { base: DEFAULT_BASE, sourceYear: null, 수정자: null, 수정일시: null };
  return { base: normalizeBase(row.기준), sourceYear: row.연도, 수정자: row.수정자, 수정일시: row.수정일시 };
}

/** 기준정보를 저장한 연도 목록 (최근 연도부터) */
export async function fetchPayrollBaseYears(): Promise<number[]> {
  const { data, error } = await getSupabaseAdmin().from(PAYROLL_BASE_TABLE).select("연도").order("연도", { ascending: false });
  if (error) throw tableError("급여 기준정보 조회", PAYROLL_BASE_TABLE, error.message);
  return (data as unknown as { 연도: number }[]).map((r) => r.연도);
}

export async function savePayrollBase(year: number, base: PayrollBase, editor: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(PAYROLL_BASE_TABLE)
    .upsert({ 연도: year, 기준: base, 수정자: editor, 수정일시: new Date().toISOString() }, { onConflict: "연도" });
  if (error) throw tableError("급여 기준정보 저장", PAYROLL_BASE_TABLE, error.message);
}

/** 관리자 화면: 그 달의 전체 명세서 */
export async function fetchPayslipsByMonth(month: string): Promise<Payslip[]> {
  const { data, error } = await getSupabaseAdmin().from(PAYSLIP_TABLE).select(PAYSLIP_COLUMNS).eq("귀속월", month);
  if (error) throw tableError("급여명세서 조회", PAYSLIP_TABLE, error.message);
  return (data as unknown as Record<string, unknown>[]).map(toPayslip);
}

/** 한 사람의 명세서 (최근 귀속월부터) */
export async function fetchPayslipsForUser(userId: number): Promise<Payslip[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAYSLIP_TABLE)
    .select(PAYSLIP_COLUMNS)
    .eq("사용자", userId)
    .order("귀속월", { ascending: false });
  if (error) throw tableError("급여명세서 조회", PAYSLIP_TABLE, error.message);
  return (data as unknown as Record<string, unknown>[]).map(toPayslip);
}

export type PayslipRecord = Omit<Payslip, "id" | "수정일시">;

/** 같은 사람·귀속월이 있으면 고쳐 쓴다 */
export async function upsertPayslip(record: PayslipRecord): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAYSLIP_TABLE)
    .upsert({ ...record, 수정일시: new Date().toISOString() }, { onConflict: "사용자,귀속월" })
    .select("id")
    .single();
  if (error) throw tableError("급여명세서 저장", PAYSLIP_TABLE, error.message);
  return Number((data as { id: number }).id);
}

export async function deletePayslip(userId: number, month: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(PAYSLIP_TABLE).delete().eq("사용자", userId).eq("귀속월", month);
  if (error) throw tableError("급여명세서 삭제", PAYSLIP_TABLE, error.message);
}

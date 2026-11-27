"use server";

import { refresh } from "next/cache";

import { todayKst } from "@/lib/attendance";
import { authorizeAction } from "@/lib/auth";
import type { SettlementWithCarryIn } from "@/app/settlement-actions";
import {
  canViewPayslips,
  deletePayslip,
  fetchConfirmedSettlementDetail,
  fetchConfirmedSettlements,
  fetchPayrollBase,
  fetchPayrollMembers,
  savePayrollBase,
  upsertPayslip,
} from "@/lib/payroll";
import {
  bonusFor,
  computeDeductions,
  computeTotals,
  isPosition,
  isReleased,
  isValidAmount,
  isYearMonth,
  isYmdDate,
  positionFromAuth,
  settlementMonthFor,
  validateBase,
  validateEarnings,
  type PayslipInput,
} from "@/lib/payroll-shared";
import { summarizeSettlement, type SettlementSummaryValues, type WorkerRates } from "@/lib/settlement-calc";
import type { ActionResult } from "@/lib/sites";

// 급여 기준정보·명세서 저장. 관리자 이상(CEO·관리자·슈퍼관리자)만 할 수 있다.

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

async function authorizeManager() {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false as const, error: "관리자 이상만 급여를 관리할 수 있습니다" };
  return auth;
}

function validYear(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 2100;
}

export async function savePayrollBaseAction(year: number, input: unknown): Promise<ActionResult<null>> {
  const auth = await authorizeManager();
  if (!auth.ok) return auth;
  if (!validYear(year)) return { ok: false, error: "연도가 올바르지 않습니다" };
  const base = validateBase(input);
  if (typeof base === "string") return { ok: false, error: base };
  try {
    await savePayrollBase(year, base, auth.name);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

function text(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s.slice(0, max);
}

export async function savePayslipAction(input: PayslipInput): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeManager();
  if (!auth.ok) return auth;
  if (typeof input !== "object" || input === null) return { ok: false, error: "입력값이 올바르지 않습니다" };
  const { 사용자, 귀속월 } = input;
  if (typeof 사용자 !== "number" || !Number.isSafeInteger(사용자) || 사용자 <= 0) return { ok: false, error: "직원을 선택하세요" };
  if (!isYearMonth(귀속월)) return { ok: false, error: "귀속월이 올바르지 않습니다" };
  if (귀속월 > todayKst().slice(0, 7)) return { ok: false, error: "이번 달 이후의 명세서는 작성할 수 없습니다" };
  for (const [label, v] of [["입사일", input.입사일], ["지급일", input.지급일]] as const) {
    if (v && !isYmdDate(v)) return { ok: false, error: `${label}이 올바르지 않습니다` };
  }
  const earnings = validateEarnings(input.지급);
  if (typeof earnings === "string") return { ok: false, error: earnings };
  if (!isValidAmount(input.소득세)) return { ok: false, error: "소득세는 0 이상의 정수로 입력하세요" };

  try {
    const user = (await fetchPayrollMembers()).find((u) => u.id === 사용자);
    if (!user) return { ok: false, error: "직원을 찾을 수 없습니다" };
    if (user.입사일 && 귀속월 < user.입사일.slice(0, 7)) {
      return { ok: false, error: `입사일(${user.입사일}) 이전 달의 명세서는 작성할 수 없습니다` };
    }
    // 직급은 권한 테이블의 직급을 따른다. 급여 직급이 아닌 경우(빈 값·실장 등)만 화면에서 고른 직급
    const 직급 = positionFromAuth(user.직급) ?? input.직급;
    if (!isPosition(직급)) {
      return { ok: false, error: `권한 테이블의 직급(${user.직급 ?? "없음"})이 급여 직급이 아닙니다. 직급을 선택하세요` };
    }
    // 한 달 전 정산월의 정산정보가 확정이면 성과급은 그 정산금으로 고정한다
    const bonus = bonusFor(await fetchConfirmedSettlements([settlementMonthFor(귀속월)], [user]), user, 귀속월);
    if (bonus) earnings.성과급 = bonus.금액;
    // 공제액은 귀속월 연도의 기준정보로 서버에서 다시 계산한다
    const { base } = await fetchPayrollBase(Number(귀속월.slice(0, 4)));
    const deductions = computeDeductions(base, earnings, input.소득세);
    const id = await upsertPayslip({
      사용자,
      이름: user.이름,
      귀속월,
      직급,
      // 입사일은 권한 테이블 값. 권한 테이블에 없을 때만 화면에서 입력한 값
      입사일: user.입사일 ?? (input.입사일 || null),
      부서: text(input.부서, 50),
      호봉: text(input.호봉, 20),
      지급일: input.지급일 || null,
      지급: earnings,
      공제: deductions,
      ...computeTotals(earnings, deductions),
      작성자: auth.name,
    });
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePayslipAction(userId: number, month: string): Promise<ActionResult<null>> {
  const auth = await authorizeManager();
  if (!auth.ok) return auth;
  if (!Number.isSafeInteger(userId) || userId <= 0 || !isYearMonth(month)) return { ok: false, error: "잘못된 요청입니다" };
  try {
    await deletePayslip(userId, month);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** 성과급 상세: 성과급으로 쓴 확정 정산정보와 저장 당시 정산결과 */
export type BonusDetail = {
  영업사원: string;
  /** 정산월 (YYYY-MM) */
  정산월: string;
  정산금: number;
  /** 저장 당시 정산결과 (예전에 저장해 상세가 없으면 null). 구간별 비율은 rates로 따로 넘긴다 */
  result: SettlementWithCarryIn | null;
  summary: SettlementSummaryValues | null;
  rates: WorkerRates | null;
};

/**
 * 급여명세서 성과급의 정산 상세. userId가 없으면 본인(권한.월급명세 Y), 있으면 관리자 이상만.
 * month는 명세서 귀속월 (성과급은 그 한 달 전 정산월의 확정 정산금)
 */
export async function getBonusDetailAction(month: string, userId: number | null): Promise<ActionResult<BonusDetail>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!isYearMonth(month)) return { ok: false, error: "귀속월이 올바르지 않습니다" };
  try {
    let person: { 영업사원ID: string; 이름: string };
    if (userId === null || userId === auth.uid) {
      if (!(await canViewPayslips(auth.uid))) return { ok: false, error: "급여명세서를 볼 수 있는 계정이 아닙니다" };
      if (!isReleased(month, todayKst())) return { ok: false, error: "아직 공개되지 않은 명세서입니다" };
      person = { 영업사원ID: auth.sid, 이름: auth.name };
    } else {
      if (!auth.canApprove) return { ok: false, error: "관리자 이상만 볼 수 있습니다" };
      if (!Number.isSafeInteger(userId) || userId <= 0) return { ok: false, error: "잘못된 직원입니다" };
      const member = (await fetchPayrollMembers()).find((u) => u.id === userId);
      if (!member) return { ok: false, error: "직원을 찾을 수 없습니다" };
      person = member;
    }
    const settleMonth = settlementMonthFor(month);
    const row = await fetchConfirmedSettlementDetail(settleMonth, person);
    if (!row) return { ok: false, error: `${settleMonth} 확정된 정산정보가 없습니다` };
    const saved = (row.결과 ?? null) as SettlementWithCarryIn | null;
    // 정산금은 저장할 때의 비율로 계산했으므로 상세도 저장 당시 비율로 보여준다 (정산금과 같은 금액)
    const rates = saved?.rates ? { upTo5m: saved.rates.upTo5m, upTo10m: saved.rates.upTo10m, over10m: saved.rates.over10m } : null;
    const summary = saved
      ? summarizeSettlement(saved.lines, saved.carryIn?.금액 ?? 0, rates ?? undefined, saved.extraCost ?? null)
      : null;
    return {
      ok: true,
      data: {
        영업사원: row.영업사원 || person.이름,
        정산월: row.정산월,
        정산금: row.정산금,
        result: saved ? { ...saved, rates: null } : null,
        summary,
        rates,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

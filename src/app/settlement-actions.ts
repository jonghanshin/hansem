"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import { computeSettlement, MAX_SETTLEMENT_SITES, type SettlementResult } from "@/lib/settlement";
import { xlsxToCells } from "@/lib/excel-cells";
import { cellsToRows, CSV_MAX_BYTES, csvToRows, decodeCsv, isUploadTable, UPLOAD_TABLES, type UploadTable } from "@/lib/settlement-upload";
import { summarizeSettlement } from "@/lib/settlement-calc";
import { formatMoney, toMoney, type ActionResult } from "@/lib/sites";
import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";
import { RESTRICTED_ROLE } from "@/lib/data-scope";

/** 관리자 이상인지와 대상 테이블을 확인한다 */
async function authorizeUpload(table: unknown): Promise<{ ok: true; table: UploadTable } | { ok: false; error: string }> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  if (!isUploadTable(table)) return { ok: false, error: "알 수 없는 테이블입니다" };
  return { ok: true, table };
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function countRows(table: UploadTable): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** 관리자 이상 전용: 테이블의 현재 건수 */
export async function countUploadTableAction(table: UploadTable): Promise<ActionResult<number>> {
  const check = await authorizeUpload(table);
  if (!check.ok) return check;
  try {
    return { ok: true, data: await countRows(check.table) };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: CSV·엑셀(첫 번째 시트)을 기존 데이터 뒤에 추가한다. 한 번의 insert라 실패하면 한 건도 들어가지 않는다 */
export async function uploadSettlementCsvAction(
  table: UploadTable,
  formData: FormData,
): Promise<ActionResult<{ inserted: number; total: number }>> {
  const check = await authorizeUpload(table);
  if (!check.ok) return check;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "CSV 또는 엑셀 파일을 선택하세요" };
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith(".xlsx");
  if (!isExcel && !name.endsWith(".csv")) {
    return { ok: false, error: ".csv 또는 .xlsx 파일만 올릴 수 있습니다 (.xls는 엑셀에서 .xlsx로 다시 저장해 주세요)" };
  }
  if (file.size > CSV_MAX_BYTES) return { ok: false, error: "파일은 10MB까지 올릴 수 있습니다" };
  try {
    const bytes = await file.arrayBuffer();
    const converted = isExcel ? cellsToRows(check.table, await xlsxToCells(bytes)) : csvToRows(check.table, decodeCsv(bytes));
    if (!converted.ok) return converted;
    const { error } = await getSupabaseAdmin().from(check.table).insert(converted.rows);
    if (error) return { ok: false, error: error.message };
    const total = await countRows(check.table);
    refresh();
    return { ok: true, data: { inserted: converted.rows.length, total } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: 테이블의 모든 행 삭제 */
export async function clearUploadTableAction(table: UploadTable): Promise<ActionResult<{ deleted: number }>> {
  const check = await authorizeUpload(table);
  if (!check.ok) return check;
  const column = UPLOAD_TABLES[check.table].anchorColumn;
  try {
    // 기본키가 없어 값이 있는 행과 없는 행을 모두 고르는 조건을 쓴다
    const { count, error } = await getSupabaseAdmin()
      .from(check.table)
      .delete({ count: "exact" })
      .or(`${column}.is.null,${column}.not.is.null`);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true, data: { deleted: count ?? 0 } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

const SETTLEMENT_INFO_TABLE = "정산정보";

export type SavedSettlement = {
  영업사원: string;
  정산월: string;
  총이익금: number;
  정산금: number;
  이월금: number;
  누적이월금: number;
  /** 전달 누적이월금을 가져온 이전 달 (기록이 없거나 리셋이면 null) */
  이전정산월: string | null;
  /** 정산대상금액에서 뺀 전달 누적이월금 */
  이전누적이월금: number;
  /** 정산시작월 기준 3개월째라 이전 누적이월금을 0으로 리셋했으면 true */
  리셋: boolean;
  /** 같은 영업사원·정산월 기록을 고쳐 썼으면 true */
  updated: boolean;
};

/** "2026-11", "11월" → 11 (읽을 수 없으면 null) */
function monthNumber(value: string | null | undefined): number | null {
  const m = String(value ?? "").trim().match(/^(?:\d{4}\s*[-./년]\s*)?(\d{1,2})\s*월?/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

/**
 * 권한.정산시작월 기준으로 3개월째 되는 달(시작월 포함 3개월 간격)인지.
 * 예: 시작월 1월 → 1월, 4월, 7월, 10월. 이 달에는 이전 누적이월금을 이어받지 않는다.
 * 권한.초기화여부가 Y인 사용자만 리셋한다 (그 외는 계속 누적).
 */
async function isCarryOverResetMonth(영업사원ID: string | null, 영업사원: string, 정산월: string): Promise<boolean> {
  const month = monthNumber(정산월);
  if (month === null) return false;
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select("영업사원ID, 이름, 역할, 정산시작월, 초기화여부");
  if (error) throw new Error(`권한 조회 실패: ${error.message}`);
  const accounts = data as unknown as {
    영업사원ID: string | null;
    이름: string | null;
    역할: string | null;
    정산시작월: string | null;
    초기화여부: string | null;
  }[];
  const account =
    (영업사원ID && accounts.find((a) => a.영업사원ID?.trim() === 영업사원ID)) ||
    accounts.find((a) => a.이름?.trim() === 영업사원 && a.역할?.trim() === RESTRICTED_ROLE);
  if (account?.초기화여부?.trim().toUpperCase() !== "Y") return false;
  const start = monthNumber(account.정산시작월);
  return start !== null && (((month - start) % 3) + 3) % 3 === 0;
}

/**
 * 현장정보의 정산월("11월")에 연도를 붙여 정산정보에 저장할 값("2026-11")을 만든다.
 * 연도는 오늘에서 가장 가까운 해로 정한다 (2026년 11월에 "12월" → 2026-12, 2027년 1월에 "12월" → 2026-12).
 */
function settlementYearMonth(label: string, now = new Date()): string | null {
  const month = monthNumber(label);
  if (month === null) return null;
  const today = now.getFullYear() * 12 + now.getMonth();
  const year = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].reduce((best, y) =>
    Math.abs(y * 12 + month - 1 - today) < Math.abs(best * 12 + month - 1 - today) ? y : best,
  );
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2026-11" → "2026-10", "2026-01" → "2025-12" */
function previousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** 정산 대상 영업사원·정산월 (선택한 현장이 각각 하나일 때만). 저장월은 연도를 붙인 값 ("2026-11") */
type SettlementTarget = { 영업사원: string; 정산월: string; 저장월: string; 영업사원ID: string | null };

async function singleTarget(lines: SettlementResult["lines"]): Promise<SettlementTarget | string> {
  const names = [...new Set(lines.map((l) => l.영업사원?.trim() ?? ""))];
  const months = [...new Set(lines.map((l) => l.정산월?.trim() ?? ""))];
  if (names.length !== 1 || !names[0]) return "영업사원이 한 명인 현장만 골라 저장하세요";
  if (months.length !== 1 || !months[0]) return "정산월이 하나인 현장만 골라 저장하세요";
  const 저장월 = settlementYearMonth(months[0]);
  if (!저장월) return `정산월 '${months[0]}'에서 월을 읽을 수 없습니다 (예: 11월)`;
  return { 영업사원: names[0], 정산월: months[0], 저장월, 영업사원ID: lines.map((l) => l.영업사원ID?.trim()).find(Boolean) ?? null };
}

/** 정산대상금액에서 빼는 전달 누적이월금 */
export type CarryIn = {
  금액: number;
  /** 값을 가져온 이전 달 (기록이 없거나 리셋이면 null) */
  이전정산월: string | null;
  /** 정산시작월 기준 3개월째라 0으로 리셋했으면 true */
  리셋: boolean;
};

async function fetchCarryIn(target: SettlementTarget): Promise<CarryIn> {
  if (await isCarryOverResetMonth(target.영업사원ID, target.영업사원, target.정산월)) {
    return { 금액: 0, 이전정산월: null, 리셋: true };
  }
  const 이전정산월 = previousYearMonth(target.저장월);
  const { data, error } = await getSupabaseAdmin()
    .from(SETTLEMENT_INFO_TABLE)
    .select("누적이월금")
    .eq("영업사원", target.영업사원)
    .eq("정산월", 이전정산월)
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(`이전 정산정보 조회 실패: ${error.message}`);
  const prev = (data as unknown as { 누적이월금: string | null }[])[0];
  return prev
    ? { 금액: toMoney(prev.누적이월금) ?? 0, 이전정산월, 리셋: false }
    : { 금액: 0, 이전정산월: null, 리셋: false };
}

function checkIds(ids: number[]): string | null {
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
    return "정산할 현장을 선택하세요";
  }
  if (ids.length > MAX_SETTLEMENT_SITES) return `한 번에 ${MAX_SETTLEMENT_SITES}개 현장까지 정산할 수 있습니다`;
  return null;
}

/**
 * 관리자 이상 전용: 선택한 현장의 정산결과를 정산정보 테이블에 저장한다. 금액은 서버에서 다시 계산한다.
 * 정산대상금액 = 이익금액 합계 - 공제금 - 전달 누적이월금. 음수면 그 금액이 이월금·누적이월금, 양수면 정산금(누적이월금 0).
 * 정산시작월 기준 3개월째 되는 달은 전달 누적이월금을 0으로 리셋한다.
 * 같은 영업사원·정산월 기록이 있으면 새로 넣지 않고 고쳐 쓴다.
 */
export async function saveSettlementAction(ids: number[]): Promise<ActionResult<SavedSettlement>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  const invalid = checkIds(ids);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { lines } = await computeSettlement(ids, auth.scope);
    if (lines.length === 0) return { ok: false, error: "정산할 미정산 현장이 없습니다" };
    const target = await singleTarget(lines);
    if (typeof target === "string") return { ok: false, error: target };
    const { 영업사원, 저장월: 정산월, 영업사원ID } = target;
    const carryIn = await fetchCarryIn(target);
    const { profit, settlement, carryOver } = summarizeSettlement(lines, carryIn.금액);
    const record = {
      영업사원,
      영업사원ID,
      정산월,
      총이익금: formatMoney(profit),
      정산금: formatMoney(settlement),
      이월금: formatMoney(carryOver),
      누적이월금: formatMoney(carryOver),
    };

    const sb = getSupabaseAdmin();
    const { data: existing, error: findError } = await sb
      .from(SETTLEMENT_INFO_TABLE)
      .select("id")
      .eq("영업사원", 영업사원)
      .eq("정산월", 정산월)
      .order("id", { ascending: false })
      .limit(1);
    if (findError) return { ok: false, error: `정산정보 조회 실패: ${findError.message}` };
    const existingId = (existing as unknown as { id: number }[])[0]?.id;
    const { error } = existingId
      ? await sb.from(SETTLEMENT_INFO_TABLE).update(record).eq("id", existingId)
      : await sb.from(SETTLEMENT_INFO_TABLE).insert(record);
    if (error) return { ok: false, error: `정산정보 저장 실패: ${error.message}` };

    return {
      ok: true,
      data: {
        영업사원,
        정산월,
        총이익금: profit,
        정산금: settlement,
        이월금: carryOver,
        누적이월금: carryOver,
        이전정산월: carryIn.이전정산월,
        이전누적이월금: carryIn.금액,
        리셋: carryIn.리셋,
        updated: !!existingId,
      },
    };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 정산 계산 결과 + 전달 누적이월금 (영업사원·정산월이 하나씩일 때만, 아니면 null) */
export type SettlementWithCarryIn = SettlementResult & { carryIn: CarryIn | null };

/** 관리자 이상 전용: 선택한 미정산 현장의 정산 내역 계산 (읽기 전용) */
export async function computeSettlementAction(ids: number[]): Promise<ActionResult<SettlementWithCarryIn>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  const invalid = checkIds(ids);
  if (invalid) return { ok: false, error: invalid };
  try {
    const result = await computeSettlement(ids, auth.scope);
    const target = await singleTarget(result.lines);
    return { ok: true, data: { ...result, carryIn: typeof target === "string" ? null : await fetchCarryIn(target) } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 정산정보 테이블의 한 행 (금액은 저장된 글자 그대로, 예: "1,480,000") */
export type SettlementInfoRow = {
  id: number;
  created_at: string;
  영업사원: string | null;
  영업사원ID: string | null;
  정산월: string | null;
  총이익금: string | null;
  정산금: string | null;
  이월금: string | null;
  누적이월금: string | null;
};

/** 관리자 이상 전용: 저장된 정산결과 목록 */
export async function listSettlementInfoAction(): Promise<ActionResult<SettlementInfoRow[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(SETTLEMENT_INFO_TABLE)
      .select("*")
      .order("id", { ascending: false })
      .limit(5000);
    if (error) return { ok: false, error: `정산정보 조회 실패: ${error.message}` };
    return { ok: true, data: data as unknown as SettlementInfoRow[] };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

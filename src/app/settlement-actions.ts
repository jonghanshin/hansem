"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import {
  computeSettlement,
  fetchExtraCostDeduction,
  MAX_SETTLEMENT_SITES,
  type SettlementExtraCostDeduction,
  type SettlementResult,
} from "@/lib/settlement";
import { xlsxToCells } from "@/lib/excel-cells";
import { cellsToRows, CSV_MAX_BYTES, csvToRows, decodeCsv, isUploadTable, UPLOAD_TABLES, type UploadTable } from "@/lib/settlement-upload";
import { summarizeSettlement, type WorkerRates } from "@/lib/settlement-calc";
import { formatMoney, toMoney, type ActionResult } from "@/lib/sites";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  checkRates,
  findSettlementAccount,
  ratesOf,
  saveAccountRates,
  type AppliedRates,
  type SettlementAccount,
} from "@/lib/settlement-account";
import { RD_PUBLISH_COLUMNS, RD_PUBLISH_TABLE, type RdPublish } from "@/lib/rd-publish";

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

export type { AppliedRates };

/**
 * 권한.정산시작월 기준으로 3개월째 되는 달(시작월 포함 3개월 간격)인지.
 * 예: 시작월 1월 → 1월, 4월, 7월, 10월. 이 달에는 이전 누적이월금을 이어받지 않는다.
 * 권한.초기화여부가 Y인 사용자만 리셋한다 (그 외는 계속 누적).
 */
function isCarryOverResetMonth(account: SettlementAccount | null, 정산월: string): boolean {
  const month = monthNumber(정산월);
  if (month === null || !account) return false;
  if (account.초기화여부?.trim().toUpperCase() !== "Y") return false;
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

async function fetchCarryIn(target: SettlementTarget, account: SettlementAccount | null): Promise<CarryIn> {
  if (isCarryOverResetMonth(account, target.정산월)) {
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
 * 정산대상금액 = 이익금액 합계 - 공제금 - 추가시공비(정산월 전달, 부가세제외) - 전달 누적이월금. 음수면 그 금액이 이월금·누적이월금, 양수면 정산금(누적이월금 0).
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
    const computed = await computeSettlement(ids, auth.scope);
    const { lines } = computed;
    if (lines.length === 0) return { ok: false, error: "정산할 미정산 현장이 없습니다" };
    const target = await singleTarget(lines);
    if (typeof target === "string") return { ok: false, error: target };
    const { 영업사원, 저장월: 정산월, 영업사원ID } = target;
    const account = await findSettlementAccount(영업사원ID, 영업사원);
    const [carryIn, extraCost] = await Promise.all([fetchCarryIn(target, account), fetchTargetExtraCost(target)]);
    const rates = ratesOf(account);
    const { profit, settlement, carryOver } = summarizeSettlement(lines, carryIn.금액, rates, extraCost);
    // 정산내역에서 다시 볼 수 있게 계산한 정산결과(현장별 내역·누적이월금·추가시공비·비율)를 함께 저장한다
    const snapshot: SettlementWithCarryIn = { ...computed, carryIn, rates, extraCost };
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
    const write = (row: Record<string, unknown>) =>
      existingId ? sb.from(SETTLEMENT_INFO_TABLE).update(row).eq("id", existingId) : sb.from(SETTLEMENT_INFO_TABLE).insert(row);
    let { error } = await write({ ...record, 현장ids: lines.map((l) => l.id), 결과: snapshot });
    // doc/정산정보_정산내역.sql을 아직 실행하지 않아 컬럼이 없으면 합계만 저장한다
    if (error && isMissingColumn(error)) ({ error } = await write(record));
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

/** 정산 계산 결과 + 전달 누적이월금·추가시공비·개인 비율 (영업사원·정산월이 하나씩일 때만, 아니면 null) */
export type SettlementWithCarryIn = SettlementResult & {
  carryIn: CarryIn | null;
  rates: AppliedRates | null;
  /** 예전에 저장·게시한 정산결과에는 없다 (그때는 현장별 한샘 금액에 포함) */
  extraCost?: SettlementExtraCostDeduction | null;
};

export type { SettlementExtraCostDeduction };

/** 정산월 전달(시공시작일 기준)의 그 영업사원 한샘추가시공비 */
function fetchTargetExtraCost(target: SettlementTarget): Promise<SettlementExtraCostDeduction> {
  return fetchExtraCostDeduction(target.영업사원, previousYearMonth(target.저장월));
}

function extraCostWarnings(extraCost: SettlementExtraCostDeduction): string[] {
  return extraCost.내역
    .filter((r) => r.시공비 === null && r.시공비원문)
    .map((r) => `${r.현장코드 ?? ""}: 추가시공비 "${r.시공비원문}"은(는) 숫자가 아니어서 합계에서 제외했습니다`);
}

/** 정산 내역 + (영업사원·정산월이 하나씩이면) 전달 누적이월금·개인 비율 */
async function computeWithCarryIn(
  ids: number[],
  scope: Parameters<typeof computeSettlement>[1],
): Promise<{ data: SettlementWithCarryIn; target: SettlementTarget | string }> {
  const result = await computeSettlement(ids, scope);
  const target = await singleTarget(result.lines);
  if (typeof target === "string") return { data: { ...result, carryIn: null, rates: null, extraCost: null }, target };
  const account = await findSettlementAccount(target.영업사원ID, target.영업사원);
  const [carryIn, extraCost] = await Promise.all([fetchCarryIn(target, account), fetchTargetExtraCost(target)]);
  return {
    data: { ...result, warnings: [...result.warnings, ...extraCostWarnings(extraCost)], carryIn, rates: ratesOf(account), extraCost },
    target,
  };
}

/** 관리자 이상 전용: 선택한 미정산 현장의 정산 내역 계산 (읽기 전용) */
export async function computeSettlementAction(ids: number[]): Promise<ActionResult<SettlementWithCarryIn>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  const invalid = checkIds(ids);
  if (invalid) return { ok: false, error: invalid };
  try {
    return { ok: true, data: (await computeWithCarryIn(ids, auth.scope)).data };
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


// ---------------------------------------------------------------------------
// RD게시: 정산결과 저장 후 그 결과를 영업사원(RD)에게 게시 기간 동안 보여준다
// ---------------------------------------------------------------------------

export type { RdPublish };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function periodError(시작일: string, 종료일: string): string | null {
  if (!ISO_DATE.test(시작일 ?? "") || !ISO_DATE.test(종료일 ?? "")) return "시작일과 종료일을 선택하세요";
  if (시작일 > 종료일) return "종료일은 시작일과 같거나 뒤여야 합니다";
  return null;
}

/** 관리자 이상 전용: 영업사원·정산월의 게시 정보 (없으면 null) */
export async function getRdPublishAction(영업사원: string, 정산월: string): Promise<ActionResult<RdPublish | null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(RD_PUBLISH_TABLE)
      .select(RD_PUBLISH_COLUMNS)
      .eq("영업사원", String(영업사원 ?? "").trim())
      .eq("정산월", String(정산월 ?? "").trim())
      .maybeSingle();
    if (error) return { ok: false, error: `RD게시 조회 실패: ${error.message}` };
    return { ok: true, data: (data as unknown as RdPublish | null) ?? null };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: 모든 게시 (RD게시 현황, 최근 시작일 순) */
export async function listRdPublishAction(): Promise<ActionResult<RdPublish[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(RD_PUBLISH_TABLE)
      .select(RD_PUBLISH_COLUMNS)
      .order("시작일", { ascending: false })
      .order("id", { ascending: false })
      .limit(1000);
    if (error) return { ok: false, error: `RD게시 조회 실패: ${error.message}` };
    const rows = (data as unknown as RdPublish[]).filter((r) => !auth.exclusion.names.includes(r.영업사원?.trim() ?? ""));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/**
 * 관리자 이상 전용: 선택한 현장의 정산결과를 게시한다. 서버에서 다시 계산한 결과를 그대로 저장해 두고,
 * RD에게는 게시 기간 동안 이 결과를 보여준다. 같은 영업사원·정산월이 있으면 결과와 기간을 새로 고쳐 쓴다.
 */
export async function publishRdAction(ids: number[], 시작일: string, 종료일: string): Promise<ActionResult<RdPublish>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  const invalid = checkIds(ids) ?? periodError(시작일, 종료일);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { data: result, target } = await computeWithCarryIn(ids, auth.scope);
    if (result.lines.length === 0) return { ok: false, error: "게시할 미정산 현장이 없습니다" };
    if (typeof target === "string") return { ok: false, error: target.replace("저장하세요", "게시하세요") };
    const { data, error } = await getSupabaseAdmin()
      .from(RD_PUBLISH_TABLE)
      .upsert(
        {
          영업사원: target.영업사원,
          영업사원ID: target.영업사원ID,
          정산월: target.정산월,
          시작일,
          종료일,
          게시자: auth.name,
          수정일시: new Date().toISOString(),
          현장ids: result.lines.map((l) => l.id),
          // 구간별 비율은 RD에게 보이면 안 되므로 저장하지 않는다 (RD 화면은 서버에서 권한 테이블 비율로 계산)
          결과: { ...result, rates: null },
        },
        { onConflict: "영업사원,정산월" },
      )
      .select(RD_PUBLISH_COLUMNS)
      .single();
    if (error) return { ok: false, error: `RD게시 저장 실패: ${error.message}` };
    return { ok: true, data: data as unknown as RdPublish };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: 게시 기간만 변경 (게시한 정산결과는 그대로) */
export async function updateRdPublishPeriodAction(id: number, 시작일: string, 종료일: string): Promise<ActionResult<RdPublish>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  const invalid = periodError(시작일, 종료일);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(RD_PUBLISH_TABLE)
      .update({ 시작일, 종료일, 게시자: auth.name, 수정일시: new Date().toISOString() })
      .eq("id", id)
      .select(RD_PUBLISH_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, error: `RD게시 변경 실패: ${error.message}` };
    if (!data) return { ok: false, error: "게시 정보를 찾을 수 없습니다 (이미 취소되었을 수 있습니다)" };
    return { ok: true, data: data as unknown as RdPublish };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: 게시 취소 (그 RD에게 정산 메뉴가 바로 사라진다) */
export async function cancelRdPublishAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  try {
    const { error } = await getSupabaseAdmin().from(RD_PUBLISH_TABLE).delete().eq("id", id);
    if (error) return { ok: false, error: `RD게시 취소 실패: ${error.message}` };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/**
 * 관리자 이상 전용: 영업사원의 구간별 근로자 비율을 권한 테이블에 저장한다.
 * 이후 정산 계산·정산결과 저장·RD게시와 RD 화면 모두 이 비율을 쓴다.
 */
export async function saveWorkerRatesAction(
  영업사원ID: string | null,
  영업사원: string,
  rates: WorkerRates,
): Promise<ActionResult<AppliedRates>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  const name = String(영업사원 ?? "").trim();
  if (!name) return { ok: false, error: "영업사원이 한 명인 현장을 골라 비율을 저장하세요" };
  const checked = checkRates(rates);
  if (typeof checked === "string") return { ok: false, error: checked };
  try {
    const account: SettlementAccount | null = await findSettlementAccount(영업사원ID?.trim() || null, name);
    if (!account) return { ok: false, error: `권한 테이블에서 영업사원 '${name}'을(를) 찾을 수 없습니다` };
    await saveAccountRates(account.id, checked);
    return { ok: true, data: { ...checked, usedDefault: false } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

// ---------------------------------------------------------------------------
// 정산내역: 지금까지 저장한 정산결과를 RD별로 보고, 저장할 때의 상세 결과를 다시 본다
// ---------------------------------------------------------------------------

/** 컬럼이 없어서 난 오류인지 (PostgREST PGRST204 / Postgres 42703) */
function isMissingColumn(error: { code?: string; message: string }): boolean {
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /could not find the .* column|column .* does not exist/i.test(error.message)
  );
}

/** 정산내역 목록의 한 행 */
export type SettlementHistoryRow = SettlementInfoRow & {
  /** 저장할 때의 현장 수 (상세 결과가 없으면 null) */
  현장수: number | null;
};

const HISTORY_COLUMNS = "id, created_at, 영업사원, 영업사원ID, 정산월, 총이익금, 정산금, 이월금, 누적이월금";

/** 관리자 이상 전용: 저장한 정산 내역 (정산월 최근 순) */
export async function listSettlementHistoryAction(): Promise<ActionResult<SettlementHistoryRow[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  try {
    const query = (columns: string) =>
      getSupabaseAdmin()
        .from(SETTLEMENT_INFO_TABLE)
        .select(columns)
        .order("정산월", { ascending: false })
        .order("id", { ascending: false })
        .limit(5000);
    let { data, error } = await query(`${HISTORY_COLUMNS}, 현장ids`);
    if (error && isMissingColumn(error)) ({ data, error } = await query(HISTORY_COLUMNS));
    if (error) return { ok: false, error: `정산정보 조회 실패: ${error.message}` };
    const rows = (data as unknown as (SettlementInfoRow & { 현장ids?: number[] | null })[])
      .filter((r) => !auth.exclusion.names.includes(r.영업사원?.trim() ?? ""))
      .map(({ 현장ids, ...r }) => ({ ...r, 현장수: 현장ids?.length ? 현장ids.length : null }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: 정산정보 한 건의 저장 당시 정산결과 (예전에 저장해 상세가 없으면 null) */
export async function getSettlementHistoryDetailAction(id: number): Promise<ActionResult<SettlementWithCarryIn | null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(SETTLEMENT_INFO_TABLE)
      .select("영업사원, 결과")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (isMissingColumn(error)) return { ok: true, data: null };
      return { ok: false, error: `정산정보 조회 실패: ${error.message}` };
    }
    const row = data as unknown as { 영업사원: string | null; 결과: SettlementWithCarryIn | null } | null;
    if (!row) return { ok: false, error: "정산정보를 찾을 수 없습니다" };
    if (auth.exclusion.names.includes(row.영업사원?.trim() ?? "")) return { ok: false, error: "정산정보를 찾을 수 없습니다" };
    return { ok: true, data: row.결과 ?? null };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

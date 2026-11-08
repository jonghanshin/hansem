"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import { computeSettlement, MAX_SETTLEMENT_SITES, type SettlementResult } from "@/lib/settlement";
import { xlsxToCells } from "@/lib/excel-cells";
import { cellsToRows, CSV_MAX_BYTES, csvToRows, decodeCsv, isUploadTable, UPLOAD_TABLES, type UploadTable } from "@/lib/settlement-upload";
import type { ActionResult } from "@/lib/sites";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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

/** 관리자 이상 전용: 선택한 미정산 현장의 정산 내역 계산 (읽기 전용) */
export async function computeSettlementAction(ids: number[]): Promise<ActionResult<SettlementResult>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "정산 권한이 없습니다" };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
    return { ok: false, error: "정산할 현장을 선택하세요" };
  }
  if (ids.length > MAX_SETTLEMENT_SITES) {
    return { ok: false, error: `한 번에 ${MAX_SETTLEMENT_SITES}개 현장까지 정산할 수 있습니다` };
  }
  try {
    return { ok: true, data: await computeSettlement(ids) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

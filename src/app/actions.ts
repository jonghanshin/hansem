"use server";

import ExcelJS from "exceljs";
import { refresh } from "next/cache";

import {
  approveRequest,
  hasPendingRequestFor,
  deleteRejectedRequest,
  insertRequest,
  loadRejectedRequest,
  rejectRequest,
  resubmitRequest,
  type RequestKind,
} from "@/lib/approvals";
import { authorizeAction, lookupSalesperson } from "@/lib/auth";
import { applyScope, withScopedSalesName, type DataScope } from "@/lib/data-scope";
import { fetchComputedSources, syncSiteTotals } from "@/lib/site-totals";
import {
  contractSumError,
  fieldKeyForHeader,
  isComputedField,
  normalizeSiteInput,
  type ActionResult,
  type ComputedSources,
  type Site,
  type SiteFieldKey,
  type SiteInput,
} from "@/lib/sites";
import {
  CATEGORY_RULES,
  CONSTRUCTION_TYPE,
  depositCategoryOf,
  REFUND_TYPE,
  normalizeDepositInput,
  pickDepositRow,
  sameDepositRow,
  type Deposit,
  type DepositInput,
  type DepositRecord,
  type DepositRow,
} from "@/lib/deposits";
import { fetchDeposits, fetchExistingSiteNumbers, fetchSites, siteNumberInScope } from "@/lib/sites-data";
import { DEPOSITS_TABLE, getSupabaseAdmin, SITES_TABLE } from "@/lib/supabase-admin";

// Server Action은 POST로 직접 호출할 수 있으므로 화면과 별개로 각 액션 첫 줄에서 로그인 여부를 다시 확인한다.
// 역할이 RD이면 scope에 따라 본인(영업사원 = 본인 이름) 데이터만 조회·수정하고, 저장하는 행의 영업사원은 본인 이름으로 고정한다.

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 2000;

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function listSitesAction(): Promise<ActionResult<Site[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  try {
    return { ok: true, data: await fetchSites(scope) };
  } catch (e) {
    return fail(e);
  }
}

export async function listDepositsAction(siteNumber: string): Promise<ActionResult<Deposit[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  if (typeof siteNumber !== "string" || !siteNumber.trim()) {
    return { ok: false, error: "현장번호가 없어 입금내역을 조회할 수 없습니다" };
  }
  try {
    return { ok: true, data: await fetchDeposits(siteNumber.trim(), scope) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// 입금내역 등록·수정·삭제: 바로 반영하지 않고 승인필요입금내역에 '승인대기' 요청으로 넣는다.
// CEO가 승인하면 입금내역에 반영된다 (lib/approvals.ts).
// ---------------------------------------------------------------------------

const TOTALS_TYPES: string[] = [CONSTRUCTION_TYPE, REFUND_TYPE];

/** 한샘 외 시공비/거래처환불입금 내역은 현장정보.한샘시공비외/환불금액 합계에 들어가므로 해당 현장 값을 갱신 */
async function resyncSitesFor(rows: (DepositRow | null)[]) {
  const numbers = new Set(
    rows.filter((r) => r && r.현장번호 && TOTALS_TYPES.includes(r.입금구분 ?? "")).map((r) => r!.현장번호!),
  );
  for (const no of numbers) {
    const { data: sites } = await getSupabaseAdmin().from(SITES_TABLE).select("*").eq("현장번호", no);
    for (const s of (sites ?? []) as Site[]) await syncQuietly(s);
  }
}

/** 수정·삭제 대상: 본인 범위(RD는 본인 영업사원 행)의 입금내역이고, 이미 대기 중인 요청이 없어야 한다 */
async function loadEditableDeposit(id: number, scope: DataScope): Promise<DepositRecord | string> {
  if (!Number.isSafeInteger(id) || id <= 0) return "잘못된 id입니다";
  const { data, error } = await applyScope(
    getSupabaseAdmin().from(DEPOSITS_TABLE).select("*").eq("id", id),
    scope,
  ).maybeSingle();
  if (error) return `입금내역 조회 실패: ${error.message}`;
  if (!data) return "해당 입금내역을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)";
  if (await hasPendingRequestFor(id)) return "이 입금내역에 승인 대기 중인 수정/삭제 요청이 이미 있습니다";
  return data as DepositRecord;
}

/**
 * 입금자: 입금구분이 한샘물대·한샘시공비면 현장번호로 찾은 현장정보의 고객명
 * (현장정보에 없거나 고객명이 비어 있으면 입력한 고객명), 한샘 외 시공비는 '나비지급',
 * 거래처환불은 화면에서 입력한 거래처명(normalizeDepositInput에서 이미 채움).
 */
async function resolvePayer(row: DepositRow): Promise<string | null> {
  const category = depositCategoryOf(row);
  if (!category) return row.입금자;
  const rule = CATEGORY_RULES[category];
  if (rule.입금자 === "vendor") return row.입금자;
  if (rule.입금자 !== "customer") return rule.입금자;
  if (row.현장번호) {
    const { data, error } = await getSupabaseAdmin()
      .from(SITES_TABLE)
      .select("고객명")
      .eq("현장번호", row.현장번호)
      .not("고객명", "is", null)
      .order("id", { ascending: false })
      .limit(1);
    if (error) throw new Error(`현장정보 조회 실패: ${error.message}`);
    const name = (data as unknown as { 고객명: string }[])[0]?.고객명;
    if (name) return name;
  }
  return row.고객명;
}

export async function createDepositAction(raw: Partial<Record<keyof DepositInput, unknown>>): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const normalized = normalizeDepositInput(raw ?? {});
  if (normalized.errors.length) return { ok: false, error: normalized.errors.join("\n") };
  try {
    const data = withScopedSalesName(normalized.data, auth.scope);
    await insertRequest("등록", { ...data, 입금자: await resolvePayer(data) }, null, auth.uid);
    refresh(); // CEO 화면의 승인 대기 건수 갱신
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDepositAction(
  id: number,
  raw: Partial<Record<keyof DepositInput, unknown>>,
): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const normalized = normalizeDepositInput(raw ?? {});
  if (normalized.errors.length) return { ok: false, error: normalized.errors.join("\n") };
  const input = withScopedSalesName(normalized.data, auth.scope);
  try {
    const target = await loadEditableDeposit(id, auth.scope);
    if (typeof target === "string") return { ok: false, error: target };
    // 화면에서 받지 않는 계약가·입금처·비고는 기존 값을 유지(현금영수증은 고른 경우에만 변경), 입금자는 입금구분 규칙으로 다시 정함
    const data: DepositRow = {
      ...input,
      계약가: target.계약가,
      입금처: target.입금처,
      비고: target.비고,
      현금영수증: input.현금영수증 ?? target.현금영수증,
      입금자: await resolvePayer(input),
    };
    if (sameDepositRow(target, data)) return { ok: false, error: "변경된 내용이 없습니다" };
    await insertRequest("수정", data, id, auth.uid);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDepositAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  // 입금내역 삭제는 관리자(CEO·관리자)만. 승인 권한자이므로 승인 요청 없이 바로 삭제한다
  if (!auth.canApprove) return { ok: false, error: "삭제 권한이 없습니다" };
  try {
    const target = await loadEditableDeposit(id, auth.scope);
    if (typeof target === "string") return { ok: false, error: target };
    const { data, error } = await getSupabaseAdmin().from(DEPOSITS_TABLE).delete().eq("id", id).select("id");
    if (error) return { ok: false, error: `입금내역 삭제 실패: ${error.message}` };
    if (!data?.length) return { ok: false, error: "해당 입금내역을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    // 한샘 외 시공비/거래처환불 내역이면 현장정보 합계 갱신
    await resyncSitesFor([pickDepositRow(target)]);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** CEO 전용: 승인 대기 요청을 승인해 입금내역에 반영한다 */
export async function approveRequestAction(requestId: number): Promise<ActionResult<{ kind: RequestKind }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "승인 권한이 없습니다" };
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return { ok: false, error: "잘못된 요청입니다" };
  try {
    const result = await approveRequest(requestId);
    if (!result) return { ok: false, error: "이미 처리되었거나 찾을 수 없는 요청입니다" };
    await resyncSitesFor([pickDepositRow(result.request), result.before]);
    refresh(); // 승인 대기 건수·목록 갱신
    return { ok: true, data: { kind: result.request.요청구분 } };
  } catch (e) {
    refresh();
    return fail(e);
  }
}

const MAX_COMMENT_LENGTH = 500;

/** CEO 전용: 승인 대기 요청을 반려한다 (입금내역은 바뀌지 않음). 반려 의견은 관리자의견에 저장 */
export async function rejectRequestAction(requestId: number, comment: unknown): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "승인 권한이 없습니다" };
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return { ok: false, error: "잘못된 요청입니다" };
  const text = typeof comment === "string" ? comment.trim() : "";
  if (!text) return { ok: false, error: "반려 의견을 입력해 주세요" };
  if (text.length > MAX_COMMENT_LENGTH) return { ok: false, error: `반려 의견은 ${MAX_COMMENT_LENGTH}자 이내로 입력해 주세요` };
  try {
    if (!(await rejectRequest(requestId, text))) return { ok: false, error: "이미 처리되었거나 찾을 수 없는 요청입니다" };
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 요청자 본인: 반려된 요청을 관리자의견에 맞게 고쳐 다시 승인 요청한다 (같은 요청 행을 승인대기로 되돌림).
 * 등록 요청은 새 내용으로, 수정 요청은 대상 입금내역 기준으로 다시 검사하고,
 * 삭제 요청은 내용 없이 대상 입금내역의 현재 값으로 다시 올린다.
 */
export async function resubmitRequestAction(
  requestId: number,
  raw: Partial<Record<keyof DepositInput, unknown>> | null,
): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return { ok: false, error: "잘못된 요청입니다" };
  try {
    const request = await loadRejectedRequest(requestId, auth.uid);
    if (!request) return { ok: false, error: "다시 요청할 수 있는 반려 건이 아닙니다 (이미 처리되었을 수 있습니다)" };

    let row: DepositRow;
    if (request.요청구분 === "등록") {
      const normalized = normalizeDepositInput(raw ?? {});
      if (normalized.errors.length) return { ok: false, error: normalized.errors.join("\n") };
      const data = withScopedSalesName(normalized.data, auth.scope);
      row = { ...data, 입금자: await resolvePayer(data) };
    } else {
      if (request.입금내역id == null) return { ok: false, error: "대상 입금내역 정보가 없는 요청이라 다시 요청할 수 없습니다" };
      const target = await loadEditableDeposit(request.입금내역id, auth.scope);
      if (typeof target === "string") return { ok: false, error: target };
      if (request.요청구분 === "삭제") {
        if (!auth.canApprove) return { ok: false, error: "삭제 권한이 없습니다" };
        row = pickDepositRow(target);
      } else {
        const normalized = normalizeDepositInput(raw ?? {});
        if (normalized.errors.length) return { ok: false, error: normalized.errors.join("\n") };
        const input = withScopedSalesName(normalized.data, auth.scope);
        row = {
          ...input,
          계약가: target.계약가,
          입금처: target.입금처,
          비고: target.비고,
          현금영수증: input.현금영수증 ?? target.현금영수증,
          입금자: await resolvePayer(input),
        };
        if (sameDepositRow(target, row)) return { ok: false, error: "현재 입금내역과 달라진 내용이 없습니다" };
      }
    }

    if (!(await resubmitRequest(requestId, auth.uid, row))) {
      return { ok: false, error: "다시 요청할 수 있는 반려 건이 아닙니다 (이미 처리되었을 수 있습니다)" };
    }
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** 요청자 본인: 다시 요청하지 않을 반려 건을 목록에서 지운다 (입금내역은 바뀌지 않음) */
export async function deleteRejectedRequestAction(requestId: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return { ok: false, error: "잘못된 요청입니다" };
  try {
    if (!(await deleteRejectedRequest(requestId, auth.uid))) {
      return { ok: false, error: "삭제할 수 있는 반려 건이 아닙니다 (이미 처리되었을 수 있습니다)" };
    }
    refresh(); // 반려 건수·목록 갱신
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** 자동 계산 필드는 사용자 입력으로 저장하지 않는다 (서버가 계산해서 채움) */
function writableFields(data: SiteInput): Partial<SiteInput> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !isComputedField(k))) as Partial<SiteInput>;
}

/** 저장 직후 자동 계산 값 갱신. 실패해도 저장 자체는 성공이므로 원래 행을 돌려준다 (상세 화면을 열 때 다시 계산됨). */
async function syncQuietly(site: Site): Promise<Site> {
  try {
    return (await syncSiteTotals(site)).site;
  } catch (e) {
    console.error("[syncSiteTotals]", e);
    return site;
  }
}

/** 상세 화면을 열 때 호출: 자동 계산 필드를 다시 계산해 테이블에 반영하고 최신 행을 돌려준다. */
export async function syncSiteTotalsAction(
  id: number,
): Promise<ActionResult<{ site: Site; warnings: string[] }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  try {
    const { data: site, error } = await applyScope(
      getSupabaseAdmin().from(SITES_TABLE).select("*").eq("id", id),
      scope,
    ).maybeSingle();
    if (error) return { ok: false, error: `현장정보 조회 실패: ${error.message}` };
    if (!site) return { ok: false, error: "해당 현장정보를 찾을 수 없습니다" };
    return { ok: true, data: await syncSiteTotals(site as Site) };
  } catch (e) {
    return fail(e);
  }
}

/** 자동 계산 필드를 더블클릭했을 때 보여줄 근거 내역 */
export async function listComputedSourcesAction(
  siteNumber: string,
  field: string,
): Promise<ActionResult<ComputedSources>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  if (typeof siteNumber !== "string" || !siteNumber.trim()) return { ok: false, error: "현장번호가 없습니다" };
  if (typeof field !== "string" || !isComputedField(field)) return { ok: false, error: "자동 계산 필드가 아닙니다" };
  try {
    if (!(await siteNumberInScope(siteNumber.trim(), scope))) {
      return { ok: false, error: "해당 현장정보를 찾을 수 없습니다" };
    }
    return { ok: true, data: await fetchComputedSources(siteNumber.trim(), field) };
  } catch (e) {
    return fail(e);
  }
}

export async function createSiteAction(
  raw: Partial<Record<SiteFieldKey, unknown>>,
): Promise<ActionResult<Site>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  const { data, errors } = normalizeSiteInput(raw);
  if (errors.length) return { ok: false, error: errors.join("\n") };
  const sumError = contractSumError(data);
  if (sumError) return { ok: false, error: sumError };
  try {
    // 새 현장의 영업사원·영업사원ID는 로그인한 영업사원ID로 권한 테이블을 찾아 채운다 (화면 입력값은 쓰지 않음)
    const sales = await lookupSalesperson(auth.sid);
    if (!sales) return { ok: false, error: `권한 테이블에서 영업사원ID '${auth.sid}'를 찾을 수 없습니다` };
    if (!sales.영업사원) return { ok: false, error: `권한 테이블에 영업사원ID '${auth.sid}'의 이름이 없습니다` };
    data.영업사원 = sales.영업사원;
    data.영업사원ID = sales.영업사원ID;
    const missing = (["현장번호", "고객명", "영업사원"] as const).filter((k) => !data[k]);
    if (missing.length) return { ok: false, error: `${missing.join(", ")}을(를) 입력하세요` };
    const { data: row, error } = await getSupabaseAdmin()
      .from(SITES_TABLE)
      .insert(withScopedSalesName(writableFields(data), scope))
      .select()
      .single();
    if (error) return { ok: false, error: `저장 실패: ${error.message}` };
    return { ok: true, data: await syncQuietly(row as Site) };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSiteAction(
  id: number,
  raw: Partial<Record<SiteFieldKey, unknown>>,
): Promise<ActionResult<Site>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  const { data, errors } = normalizeSiteInput(raw);
  if (errors.length) return { ok: false, error: errors.join("\n") };
  const sumError = contractSumError(data);
  if (sumError) return { ok: false, error: sumError };
  try {
    const { data: row, error } = await applyScope(
      getSupabaseAdmin()
        .from(SITES_TABLE)
        .update(withScopedSalesName(writableFields(data), scope))
        .eq("id", id),
      scope,
    )
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: `수정 실패: ${error.message}` };
    if (!row) return { ok: false, error: "해당 현장정보를 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    // 현장번호가 바뀌었을 수 있으므로 다시 계산
    return { ok: true, data: await syncQuietly(row as Site) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// 엑셀 업로드: 1) 파싱해서 미리보기 반환 → 2) 사용자가 고른 행만 등록
// ---------------------------------------------------------------------------

export type ExcelPreviewRow = {
  rowNumber: number; // 엑셀 상의 행 번호
  data: SiteInput;
  errors: string[];
  duplicate: "db" | "file" | null; // 같은 현장번호가 DB 또는 파일 안에 이미 있음
};

export type ExcelPreview = {
  rows: ExcelPreviewRow[];
  matchedColumns: SiteFieldKey[];
  ignoredColumns: string[];
};

/** exceljs 셀 값을 단순 값(문자열/숫자/Date)으로 변환 */
function plainCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== "object") return value;
  if ("richText" in value) return value.richText.map((t) => t.text).join("");
  if ("result" in value) return plainCellValue(value.result as ExcelJS.CellValue);
  if ("text" in value) return value.text;
  if ("error" in value) return null;
  return null;
}

export async function parseExcelAction(formData: FormData): Promise<ActionResult<ExcelPreview>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "파일이 없습니다" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: ".xlsx 파일만 업로드할 수 있습니다 (.xls는 엑셀에서 .xlsx로 다시 저장해 주세요)" };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "파일이 너무 큽니다 (최대 5MB)" };

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return { ok: false, error: "시트가 없습니다" };

    // 헤더 행 찾기: 상단 10행 중 알려진 컬럼명이 2개 이상 있는 첫 행
    let headerRowNumber = 0;
    let columnMap = new Map<number, SiteFieldKey>();
    let ignoredColumns: string[] = [];
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const map = new Map<number, SiteFieldKey>();
      const ignored: string[] = [];
      sheet.getRow(r).eachCell((cell, col) => {
        const text = String(plainCellValue(cell.value) ?? "").trim();
        if (!text) return;
        const key = fieldKeyForHeader(text);
        if (key) map.set(col, key);
        else ignored.push(text);
      });
      if (map.size >= 2) {
        headerRowNumber = r;
        columnMap = map;
        ignoredColumns = ignored;
        break;
      }
    }
    if (!headerRowNumber) {
      return {
        ok: false,
        error: "헤더 행을 찾지 못했습니다. 첫 행에 '현장번호', '고객명' 같은 컬럼명이 있어야 합니다.",
      };
    }

    const parsed: Omit<ExcelPreviewRow, "duplicate">[] = [];
    for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const raw: Partial<Record<SiteFieldKey, unknown>> = {};
      let hasValue = false;
      for (const [col, key] of columnMap) {
        const v = plainCellValue(row.getCell(col).value);
        if (v !== null && String(v).trim() !== "") hasValue = true;
        raw[key] = v;
      }
      if (!hasValue) continue; // 빈 행 건너뜀
      const { data, errors } = normalizeSiteInput(raw);
      parsed.push({ rowNumber: r, data, errors });
      if (parsed.length > MAX_UPLOAD_ROWS) {
        return { ok: false, error: `한 번에 ${MAX_UPLOAD_ROWS}행까지 업로드할 수 있습니다` };
      }
    }

    const numbers = [...new Set(parsed.map((p) => p.data.현장번호).filter((n): n is string => !!n))];
    const existing = await fetchExistingSiteNumbers(numbers);
    const seen = new Set<string>();
    const rows: ExcelPreviewRow[] = parsed.map((p) => {
      const no = p.data.현장번호;
      let duplicate: ExcelPreviewRow["duplicate"] = null;
      if (no && existing.has(no)) duplicate = "db";
      else if (no && seen.has(no)) duplicate = "file";
      if (no) seen.add(no);
      return { ...p, duplicate };
    });

    return {
      ok: true,
      data: { rows, matchedColumns: [...new Set(columnMap.values())], ignoredColumns },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function insertSitesAction(
  raws: Partial<Record<SiteFieldKey, unknown>>[],
): Promise<ActionResult<Site[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const { scope } = auth;
  if (!Array.isArray(raws) || raws.length === 0) return { ok: false, error: "등록할 행이 없습니다" };
  if (raws.length > MAX_UPLOAD_ROWS) return { ok: false, error: `한 번에 ${MAX_UPLOAD_ROWS}행까지 등록할 수 있습니다` };

  const rows: Partial<SiteInput>[] = [];
  for (const [i, raw] of raws.entries()) {
    const { data, errors } = normalizeSiteInput(raw);
    if (errors.length) return { ok: false, error: `${i + 1}번째 행: ${errors.join(", ")}` };
    rows.push(withScopedSalesName(writableFields(data), scope)); // 엑셀의 자동 계산 컬럼 값은 무시하고 아래에서 계산
  }
  try {
    // 한 번의 insert라 일부만 들어가는 일 없이 전부 성공하거나 전부 실패한다.
    const { data, error } = await getSupabaseAdmin().from(SITES_TABLE).insert(rows).select();
    if (error) return { ok: false, error: `등록 실패: ${error.message}` };
    const synced: Site[] = [];
    for (const site of data as Site[]) synced.push(await syncQuietly(site));
    return { ok: true, data: synced };
  } catch (e) {
    return fail(e);
  }
}

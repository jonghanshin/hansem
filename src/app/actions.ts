"use server";

import ExcelJS from "exceljs";

import { fetchComputedSources, syncSiteTotals } from "@/lib/site-totals";
import {
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
  normalizeDepositInput,
  toDeposit,
  type Deposit,
  type DepositInput,
  type DepositRow,
} from "@/lib/deposits";
import { fetchDeposits, fetchExistingSiteNumbers, fetchSites } from "@/lib/sites-data";
import { DEPOSITS_TABLE, getSupabaseAdmin, SITES_TABLE } from "@/lib/supabase-admin";

// NOTE: 이 앱에는 아직 로그인이 없다. Server Action은 POST로 누구나 호출할 수 있으므로
// 외부에 배포하기 전에 각 액션에 인증/권한 확인을 추가해야 한다.

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 2000;

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function listSitesAction(): Promise<ActionResult<Site[]>> {
  try {
    return { ok: true, data: await fetchSites() };
  } catch (e) {
    return fail(e);
  }
}

export async function listDepositsAction(siteNumber: string): Promise<ActionResult<Deposit[]>> {
  if (typeof siteNumber !== "string" || !siteNumber.trim()) {
    return { ok: false, error: "현장번호가 없어 입금내역을 조회할 수 없습니다" };
  }
  try {
    return { ok: true, data: await fetchDeposits(siteNumber.trim()) };
  } catch (e) {
    return fail(e);
  }
}

export async function createDepositAction(
  raw: Partial<Record<keyof DepositInput, unknown>>,
): Promise<ActionResult<Deposit>> {
  const { data, errors } = normalizeDepositInput(raw ?? {});
  if (errors.length) return { ok: false, error: errors.join("\n") };
  try {
    const { data: row, error } = await getSupabaseAdmin().from(DEPOSITS_TABLE).insert(data).select().single();
    if (error) return { ok: false, error: `입금 등록 실패: ${error.message}` };
    // 시공비/거래처환불입금 내역은 현장정보.한샘시공비외/환불금액 합계에 들어가므로 해당 현장 값을 갱신
    if ((data.입금구분 === "시공비" || data.입금구분 === "거래처환불입금") && data.현장번호) {
      const { data: sites } = await getSupabaseAdmin().from(SITES_TABLE).select("*").eq("현장번호", data.현장번호);
      for (const s of (sites ?? []) as Site[]) await syncQuietly(s);
    }
    return { ok: true, data: toDeposit(row as DepositRow) };
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
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  try {
    const { data: site, error } = await getSupabaseAdmin().from(SITES_TABLE).select("*").eq("id", id).maybeSingle();
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
  if (typeof siteNumber !== "string" || !siteNumber.trim()) return { ok: false, error: "현장번호가 없습니다" };
  if (typeof field !== "string" || !isComputedField(field)) return { ok: false, error: "자동 계산 필드가 아닙니다" };
  try {
    return { ok: true, data: await fetchComputedSources(siteNumber.trim(), field) };
  } catch (e) {
    return fail(e);
  }
}

export async function createSiteAction(
  raw: Partial<Record<SiteFieldKey, unknown>>,
): Promise<ActionResult<Site>> {
  const { data, errors } = normalizeSiteInput(raw);
  if (errors.length) return { ok: false, error: errors.join("\n") };
  try {
    const { data: row, error } = await getSupabaseAdmin()
      .from(SITES_TABLE)
      .insert(writableFields(data))
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
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 id입니다" };
  const { data, errors } = normalizeSiteInput(raw);
  if (errors.length) return { ok: false, error: errors.join("\n") };
  try {
    const { data: row, error } = await getSupabaseAdmin()
      .from(SITES_TABLE)
      .update(writableFields(data))
      .eq("id", id)
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
  if (!Array.isArray(raws) || raws.length === 0) return { ok: false, error: "등록할 행이 없습니다" };
  if (raws.length > MAX_UPLOAD_ROWS) return { ok: false, error: `한 번에 ${MAX_UPLOAD_ROWS}행까지 등록할 수 있습니다` };

  const rows: Partial<SiteInput>[] = [];
  for (const [i, raw] of raws.entries()) {
    const { data, errors } = normalizeSiteInput(raw);
    if (errors.length) return { ok: false, error: `${i + 1}번째 행: ${errors.join(", ")}` };
    rows.push(writableFields(data)); // 엑셀의 자동 계산 컬럼 값은 무시하고 아래에서 계산
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

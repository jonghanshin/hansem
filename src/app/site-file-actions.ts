"use server";

import { authorizeAction } from "@/lib/auth";
import { isBlockedFile } from "@/lib/board-shared";
import { applyScope, type DataScope } from "@/lib/data-scope";
import { removeSiteFile, writeSiteFile } from "@/lib/site-files";
import {
  isMultiSiteFileKind,
  isSiteFileKind,
  parseSiteFiles,
  SITE_FILE_MAX_BYTES,
  SITE_FILE_MAX_COUNT,
  siteFileColumn,
  type SiteFileInfo,
  type SiteFileKind,
} from "@/lib/site-files-shared";
import type { ActionResult, Site } from "@/lib/sites";
import { getSupabaseAdmin, SITES_TABLE } from "@/lib/supabase-admin";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 범위 안의 현장인지 확인하고 현재 행을 읽는다 */
async function loadSite(siteId: number, scope: DataScope): Promise<Site | null> {
  const { data, error } = await applyScope(getSupabaseAdmin().from(SITES_TABLE).select("*").eq("id", siteId), scope).maybeSingle();
  if (error) throw new Error(`현장정보 조회 실패: ${error.message}`);
  return data as Site | null;
}

async function saveColumn(siteId: number, kind: SiteFileKind, value: string | null, scope: DataScope): Promise<Site | null> {
  const { data, error } = await applyScope(
    getSupabaseAdmin().from(SITES_TABLE).update({ [siteFileColumn(kind)]: value }).eq("id", siteId),
    scope,
  )
    .select()
    .maybeSingle();
  if (error) throw new Error(`현장정보 저장 실패: ${error.message}`);
  return data as Site | null;
}

function checkTarget(siteId: unknown, kind: unknown): string | null {
  if (!Number.isSafeInteger(siteId) || (siteId as number) <= 0) return "잘못된 현장입니다";
  if (!isSiteFileKind(kind)) return "알 수 없는 문서 종류입니다";
  return null;
}

/**
 * 현장 문서 파일을 올린다.
 * - 한 파일 문서(최종계약서 등): 이미 있으면 새 파일로 바꾸고 이전 파일은 지운다
 * - 여러 파일 문서(참고파일): 기존 목록 뒤에 덧붙인다 (요청 크기 제한 때문에 화면에서 파일마다 한 번씩 호출)
 */
export async function uploadSiteFileAction(siteId: number, kind: SiteFileKind, formData: FormData): Promise<ActionResult<Site>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const invalid = checkTarget(siteId, kind);
  if (invalid) return { ok: false, error: invalid };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 선택하세요" };
  if (file.size > SITE_FILE_MAX_BYTES) return { ok: false, error: "파일은 20MB까지 올릴 수 있습니다" };
  if (isBlockedFile(file.name)) return { ok: false, error: "실행 파일 형식은 올릴 수 없습니다" };
  const multi = isMultiSiteFileKind(kind);

  try {
    const site = await loadSite(siteId, auth.scope);
    if (!site) return { ok: false, error: "해당 현장정보를 찾을 수 없습니다" };
    const existing = parseSiteFiles(site[siteFileColumn(kind)]);
    if (multi && existing.length >= SITE_FILE_MAX_COUNT) {
      return { ok: false, error: `파일은 ${SITE_FILE_MAX_COUNT}개까지 올릴 수 있습니다` };
    }
    const info = await writeSiteFile(kind, file);
    const value = multi ? JSON.stringify([...existing, info]) : JSON.stringify(info);
    let saved: Site | null;
    try {
      saved = await saveColumn(siteId, kind, value, auth.scope);
    } catch (e) {
      await removeSiteFile(kind, info); // DB 저장에 실패하면 방금 쓴 파일을 지운다
      throw e;
    }
    if (!saved) {
      await removeSiteFile(kind, info);
      return { ok: false, error: "해당 현장정보를 찾을 수 없습니다" };
    }
    if (!multi) for (const prev of existing) await removeSiteFile(kind, prev);
    return { ok: true, data: saved };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 현장 문서 파일을 지운다. 여러 파일 문서는 stored(저장 이름)로 지정한 파일 하나만 지운다 */
export async function deleteSiteFileAction(siteId: number, kind: SiteFileKind, stored?: string): Promise<ActionResult<Site>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const invalid = checkTarget(siteId, kind);
  if (invalid) return { ok: false, error: invalid };
  const multi = isMultiSiteFileKind(kind);
  if (multi && (typeof stored !== "string" || !stored)) return { ok: false, error: "지울 파일을 지정하세요" };
  try {
    const site = await loadSite(siteId, auth.scope);
    if (!site) return { ok: false, error: "해당 현장정보를 찾을 수 없습니다" };
    const existing = parseSiteFiles(site[siteFileColumn(kind)]);
    let removed: SiteFileInfo[];
    let value: string | null;
    if (multi) {
      removed = existing.filter((f) => f.stored === stored);
      if (removed.length === 0) return { ok: false, error: "파일을 찾을 수 없습니다" };
      const rest = existing.filter((f) => f.stored !== stored);
      value = rest.length ? JSON.stringify(rest) : null;
    } else {
      removed = existing;
      value = null;
    }
    const saved = await saveColumn(siteId, kind, value, auth.scope);
    if (!saved) return { ok: false, error: "해당 현장정보를 찾을 수 없습니다" };
    for (const f of removed) await removeSiteFile(kind, f);
    return { ok: true, data: saved };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

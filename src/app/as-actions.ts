"use server";

import { refresh } from "next/cache";

import {
  deleteAsCase,
  deleteAsHistory,
  fetchAsCase,
  fetchAsHistory,
  fetchAsMembers,
  insertAsCases,
  insertAsHistory,
  searchAsSites,
  setAsPhotos,
  updateAsCase,
  type AsInput,
  type AsView,
} from "@/lib/as";
import { removeAsFile, writeAsFile } from "@/lib/as-files";
import {
  AS_BILLING_STATES,
  AS_CHARGES,
  AS_CHECK_METHODS,
  AS_CUSTOMER_CHECKS,
  AS_FILE_MAX_BYTES,
  AS_FILES_MAX,
  AS_HISTORY_KINDS,
  AS_LONG_TEXT_MAX,
  AS_PAY_STATES,
  AS_PHOTO_KINDS,
  AS_RECURRENCES,
  AS_RESULTS,
  AS_ROUTES,
  AS_STATES,
  AS_TEXT_MAX,
  AS_URGENCIES,
  type AsPhoto,
  type AsPhotoKind,
  joinTrades,
  tradesOf,
  type AsSiteHit,
} from "@/lib/as-shared";
import { authorizeAction } from "@/lib/auth";
import { isBlockedFile } from "@/lib/board-shared";
import type { Exclusion } from "@/lib/excluded-users";
import { choice, date, dateTime, FormError, integer, messageOf, text, todayKorea } from "@/lib/form-fields";
import type { ActionResult } from "@/lib/sites";
import { fetchSites } from "@/lib/sites-data";

// A/S 접수·수정·삭제, 처리 이력, 사진.
// RD와 관리자 이상이 사용한다. RD는 담당 RD가 본인인 A/S만, 관리자 이상은 모든 A/S를 다룬다.

type Auth = Extract<Awaited<ReturnType<typeof authorizeAction>>, { ok: true }>;

function viewOf(auth: { exclusion: Exclusion; scope: { salesName: string | null } }): AsView {
  return { ...auth.exclusion, salesName: auth.scope.salesName };
}

function failOf(e: unknown): { ok: false; error: string } {
  return { ok: false, error: messageOf(e) };
}

async function authorize(): Promise<Auth | { ok: false; error: string }> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "A/S 관리를 사용할 권한이 없습니다" };
  return auth;
}

const validId = (id: unknown): id is number => Number.isSafeInteger(id) && (id as number) > 0;

// ---------- 입력 항목 ----------

type FieldSpec =
  | { key: keyof AsInput; kind: "text" | "long"; max?: number }
  | { key: keyof AsInput; kind: "choice"; options: readonly string[]; fallback: string }
  | { key: keyof AsInput; kind: "date" | "datetime" | "int" };

/** 화면에서 고칠 수 있는 항목 (현장번호·담당 RD·원접수는 접수할 때만 정한다) */
const FIELDS: FieldSpec[] = [
  { key: "고객번호", kind: "text", max: 50 },
  { key: "고객명", kind: "text", max: 50 },
  { key: "연락처", kind: "text", max: 50 },
  { key: "현장주소", kind: "text" },
  { key: "공사완료일", kind: "date" },
  { key: "접수일", kind: "date" },
  { key: "접수경로", kind: "choice", options: AS_ROUTES, fallback: "" },
  { key: "담당자", kind: "text", max: 50 },
  { key: "협력업체", kind: "text", max: 300 },
  { key: "발생위치", kind: "text" },
  { key: "발생일", kind: "date" },
  { key: "긴급도", kind: "choice", options: AS_URGENCIES, fallback: "일반" },
  { key: "고객요청", kind: "long" },
  { key: "증상", kind: "long" },
  { key: "초기원인", kind: "long" },
  { key: "방문예정일시", kind: "datetime" },
  { key: "처리기한", kind: "date" },
  { key: "진행상태", kind: "choice", options: AS_STATES, fallback: "접수" },
  { key: "최근안내일", kind: "date" },
  { key: "유무상", kind: "choice", options: AS_CHARGES, fallback: "미정" },
  { key: "협의일", kind: "date" },
  { key: "처리계획", kind: "long" },
  { key: "고객안내", kind: "long" },
  { key: "유무상근거", kind: "long" },
  { key: "처리완료일", kind: "date" },
  { key: "고객확인", kind: "choice", options: AS_CUSTOMER_CHECKS, fallback: "미확인" },
  { key: "고객확인일", kind: "date" },
  { key: "확인방법", kind: "choice", options: AS_CHECK_METHODS, fallback: "" },
  { key: "처리결과", kind: "choice", options: AS_RESULTS, fallback: "" },
  { key: "재발여부", kind: "choice", options: AS_RECURRENCES, fallback: "미확인" },
  { key: "최종조치", kind: "long" },
  { key: "추가요청", kind: "long" },
  { key: "추적계획", kind: "long" },
  { key: "자재비", kind: "int" },
  { key: "인건비", kind: "int" },
  { key: "기타비용", kind: "int" },
  { key: "비용메모", kind: "long" },
  { key: "고객청구액", kind: "int" },
  { key: "정산상태", kind: "choice", options: AS_BILLING_STATES, fallback: "미정" },
  { key: "지급상태", kind: "choice", options: AS_PAY_STATES, fallback: "미정" },
];

/** 폼에 들어 있는 항목만 읽는다 (상세 화면은 전체, 진행 버튼 창은 일부) */
function parseFields(form: FormData): Partial<AsInput> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!form.has(f.key)) continue;
    switch (f.kind) {
      case "text":
        out[f.key] = text(form, f.key, f.max ?? AS_TEXT_MAX);
        break;
      case "long":
        out[f.key] = text(form, f.key, AS_LONG_TEXT_MAX);
        break;
      case "choice":
        out[f.key] = choice(form, f.key, f.options, f.fallback);
        break;
      case "date":
        out[f.key] = date(form, f.key);
        break;
      case "datetime":
        out[f.key] = dateTime(form, f.key);
        break;
      case "int":
        out[f.key] = integer(form, f.key);
        break;
    }
  }
  // 공종: 여러 개 선택 (체크 칩). 상세 화면에서는 "공종표시"가 있을 때만 공종을 바꾼다
  if (form.has("공종표시")) out.공종 = joinTrades(form.getAll("공종").map(String));
  if ("고객명" in out && !out.고객명) throw new FormError("고객명을 입력하세요");
  if ("접수일" in out && !out.접수일) out.접수일 = todayKorea();
  return out as Partial<AsInput>;
}

function formFail(e: unknown): { ok: false; error: string } {
  return e instanceof FormError ? { ok: false, error: e.message } : failOf(e);
}

// ---------- 현장 검색 ----------

export async function searchAsSitesAction(q: string): Promise<ActionResult<AsSiteHit[]>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (typeof q !== "string" || q.trim().length < 1) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchAsSites(q.slice(0, 50), auth.scope, viewOf(auth)) };
  } catch (e) {
    return failOf(e);
  }
}

// ---------- 접수 ----------

type Symptom = { 공종: string; 고객요청: string; 발생위치: string; 긴급도: string };

function symptoms(form: FormData): Symptom[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("증상목록") ?? "[]"));
  } catch {
    throw new FormError("증상 목록이 올바르지 않습니다");
  }
  const list = (Array.isArray(raw) ? raw : []).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const 긴급도 = s(o.긴급도, 10);
    return {
      공종: joinTrades(Array.isArray(o.공종) ? o.공종.map(String) : tradesOf(s(o.공종, 200))),
      고객요청: s(o.고객요청, AS_LONG_TEXT_MAX),
      발생위치: s(o.발생위치, AS_TEXT_MAX),
      긴급도: (AS_URGENCIES as readonly string[]).includes(긴급도) ? 긴급도 : "일반",
    };
  });
  const filled = list.filter((x) => x.고객요청 || x.공종);
  if (filled.length === 0) throw new FormError("증상·요청 내용을 입력하세요");
  if (filled.some((x) => !x.고객요청)) throw new FormError("증상마다 증상·요청 내용을 입력하세요");
  if (filled.length > 10) throw new FormError("한 번에 10건까지 접수할 수 있습니다");
  return filled;
}

/**
 * A/S 접수. 현장정보에서 찾은 현장이면 현장번호로 다시 확인해 담당 RD를 채우고,
 * 직접 입력한 고객이면 RD는 본인, 관리자는 고른 RD(없으면 미지정)가 담당 RD가 된다.
 * 증상이 여러 개면 증상마다 접수 1건씩 만든다.
 */
export async function createAsAction(form: FormData): Promise<ActionResult<{ ids: number[] }>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  try {
    const common = parseFields(form);
    if (!common.고객명) return { ok: false, error: "고객명을 입력하세요" };
    const list = symptoms(form);

    const 현장번호 = text(form, "현장번호", 50) || null;
    let 영업사원: string | null = null;
    let 영업사원ID: string | null = null;
    if (현장번호) {
      const site = (await fetchSites(auth.scope)).find((s) => s.현장번호?.trim() === 현장번호);
      if (!site) return { ok: false, error: `현장 ${현장번호}을(를) 찾을 수 없습니다 (볼 권한이 없을 수 있습니다)` };
      영업사원 = site.영업사원 ?? null;
      영업사원ID = site.영업사원ID ?? null;
    } else if (auth.scope.salesName !== null) {
      영업사원 = auth.scope.salesName;
      영업사원ID = auth.sid;
    } else {
      const picked = text(form, "영업사원", 50);
      if (picked) {
        if (!(await fetchAsMembers(auth.exclusion)).some((m) => m.이름 === picked)) return { ok: false, error: "담당 RD를 다시 선택하세요" };
        영업사원 = picked;
      }
    }

    // 재발·재접수: 원 접수가 볼 수 있는 A/S인지 확인
    const 원접수 = Number(form.get("원접수id") || 0);
    const 원접수id = 원접수 > 0 && (await fetchAsCase(원접수, viewOf(auth))) ? 원접수 : null;

    const base: AsInput = {
      현장번호,
      고객번호: common.고객번호 ?? "",
      고객명: common.고객명,
      연락처: common.연락처 ?? "",
      현장주소: common.현장주소 ?? "",
      공사완료일: common.공사완료일 ?? null,
      영업사원,
      영업사원ID,
      접수일: common.접수일 ?? todayKorea(),
      접수경로: common.접수경로 ?? "",
      담당자: common.담당자 ?? "",
      협력업체: common.협력업체 ?? "",
      공종: "",
      발생위치: "",
      발생일: common.발생일 ?? null,
      긴급도: "일반",
      고객요청: "",
      증상: "",
      초기원인: "",
      방문예정일시: null,
      처리기한: common.처리기한 ?? null,
      진행상태: "접수",
      최근안내일: null,
      유무상: "미정",
      협의일: null,
      처리계획: "",
      고객안내: "",
      유무상근거: "",
      처리완료일: null,
      고객확인: "미확인",
      고객확인일: null,
      확인방법: "",
      처리결과: "",
      재발여부: "미확인",
      최종조치: "",
      추가요청: "",
      추적계획: "",
      자재비: null,
      인건비: null,
      기타비용: null,
      비용메모: "",
      고객청구액: null,
      정산상태: "미정",
      지급상태: "미정",
      원접수id,
    };
    const ids = await insertAsCases(
      list.map((s) => ({ ...base, ...s })),
      auth.uid,
    );
    refresh();
    return { ok: true, data: { ids } };
  } catch (e) {
    return formFail(e);
  }
}

/** A/S 수정: 폼에 들어 있는 항목만 바꾼다 (상세 화면 저장, 진행 버튼 창) */
export async function updateAsAction(id: number, form: FormData): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!validId(id)) return { ok: false, error: "잘못된 접수 번호입니다" };
  try {
    if (!(await fetchAsCase(id, viewOf(auth)))) return { ok: false, error: "A/S를 찾을 수 없습니다 (삭제되었거나 볼 권한이 없습니다)" };
    const input = parseFields(form);
    if (Object.keys(input).length === 0) return { ok: true, data: null };
    await updateAsCase(id, input);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return formFail(e);
  }
}

export async function deleteAsAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!validId(id)) return { ok: false, error: "잘못된 접수 번호입니다" };
  try {
    const c = await fetchAsCase(id, viewOf(auth));
    if (!c) return { ok: false, error: "A/S를 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    await deleteAsCase(id); // 이력은 DB에서 함께 지워진다 (on delete cascade)
    await Promise.all(c.사진.map((p) => removeAsFile(p.stored)));
    return { ok: true, data: null };
  } catch (e) {
    return failOf(e);
  }
}

// ---------- 처리 이력 ----------

/**
 * 처리 이력 추가 (일시는 비우면 지금). 진행 상태를 함께 바꿀 수 있고,
 * '고객에게 안내함'을 체크하면 최근 고객안내일을 이력 날짜로 갱신한다.
 */
export async function addAsHistoryAction(id: number, form: FormData): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!validId(id)) return { ok: false, error: "잘못된 접수 번호입니다" };
  try {
    const c = await fetchAsCase(id, viewOf(auth));
    if (!c) return { ok: false, error: "A/S를 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    const 일시 = dateTime(form, "일시", "일시");
    if (!일시) return { ok: false, error: "일시를 입력하세요" };
    const 내용 = text(form, "내용", AS_LONG_TEXT_MAX, "내용");
    if (!내용) return { ok: false, error: "확인 내용·조치를 입력하세요" };
    await insertAsHistory(
      id,
      {
        일시,
        구분: choice(form, "구분", AS_HISTORY_KINDS, "", "구분"),
        업체: text(form, "업체", AS_TEXT_MAX, "담당자·업체"),
        내용,
        결과: text(form, "결과", AS_TEXT_MAX, "결과"),
      },
      { uid: auth.uid, name: auth.name },
    );
    const 진행상태 = choice(form, "진행상태", AS_STATES, "", "진행 상태");
    const notified = form.get("고객안내") === "on";
    const day = 일시.slice(0, 10);
    const patch: Partial<AsInput> = {
      ...(진행상태 && 진행상태 !== c.진행상태 ? { 진행상태 } : {}),
      ...(notified && (!c.최근안내일 || c.최근안내일 < day) ? { 최근안내일: day } : {}),
    };
    if (Object.keys(patch).length) await updateAsCase(id, patch);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return formFail(e);
  }
}

/** 처리 이력 삭제: 남긴 본인 또는 관리자 이상 */
export async function deleteAsHistoryAction(historyId: number): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!validId(historyId)) return { ok: false, error: "잘못된 이력 번호입니다" };
  try {
    const h = await fetchAsHistory(historyId);
    if (!h) return { ok: false, error: "이력을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (!(await fetchAsCase(h.접수id, viewOf(auth)))) return { ok: false, error: "A/S를 찾을 수 없습니다" };
    if (h.등록자 !== auth.uid && !auth.canApprove) return { ok: false, error: "본인이 남긴 이력만 삭제할 수 있습니다" };
    await deleteAsHistory(historyId);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return failOf(e);
  }
}

// ---------- 사진·증빙 ----------

/** 사진·증빙 파일 한 개 올리기 (kind: 접수 / 완료 / 증빙) */
export async function uploadAsPhotoAction(id: number, formData: FormData): Promise<ActionResult<AsPhoto[]>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!validId(id)) return { ok: false, error: "잘못된 접수 번호입니다" };
  const file = formData.get("file");
  const kind = String(formData.get("kind") ?? "");
  if (!(AS_PHOTO_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "사진 구분이 올바르지 않습니다" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 선택하세요" };
  if (file.size > AS_FILE_MAX_BYTES) return { ok: false, error: `${file.name}: 파일은 20MB까지 올릴 수 있습니다` };
  if (isBlockedFile(file.name)) return { ok: false, error: `${file.name}: 실행 파일 형식은 올릴 수 없습니다` };
  try {
    const c = await fetchAsCase(id, viewOf(auth));
    if (!c) return { ok: false, error: "A/S를 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (c.사진.length >= AS_FILES_MAX) return { ok: false, error: `사진·증빙은 ${AS_FILES_MAX}개까지 올릴 수 있습니다` };
    const info = await writeAsFile(file, auth.name, kind as AsPhotoKind);
    const photos = [...c.사진, info];
    try {
      await setAsPhotos(id, photos);
    } catch (e) {
      await removeAsFile(info.stored);
      throw e;
    }
    refresh();
    return { ok: true, data: photos };
  } catch (e) {
    return failOf(e);
  }
}

/** 사진·증빙 삭제: 올린 본인 또는 관리자 이상 */
export async function deleteAsPhotoAction(id: number, stored: string): Promise<ActionResult<AsPhoto[]>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!validId(id) || typeof stored !== "string") return { ok: false, error: "잘못된 요청입니다" };
  try {
    const c = await fetchAsCase(id, viewOf(auth));
    if (!c) return { ok: false, error: "A/S를 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    const target = c.사진.find((p) => p.stored === stored);
    if (!target) return { ok: false, error: "파일을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (target.by !== auth.name && !auth.canApprove) return { ok: false, error: "본인이 올린 파일만 삭제할 수 있습니다" };
    const photos = c.사진.filter((p) => p.stored !== stored);
    await setAsPhotos(id, photos);
    await removeAsFile(stored);
    refresh();
    return { ok: true, data: photos };
  } catch (e) {
    return failOf(e);
  }
}

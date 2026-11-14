"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import {
  deleteConsult,
  deleteConsultRecord,
  fetchConsult,
  fetchConsultMembers,
  fetchConsultRecord,
  insertConsult,
  insertConsultRecord,
  linkConsultSite,
  setConsultFiles,
  updateConsult,
  type ConsultInput,
  type ConsultView,
} from "@/lib/consult";
import { isBlockedFile } from "@/lib/board-shared";
import { removeConsultFile, writeConsultFile } from "@/lib/consult-files";
import {
  CONSULT_FILE_MAX_BYTES,
  CONSULT_FILES_MAX,
  CONSULT_KINDS,
  CONTACT_METHODS,
  CONTACT_STATES,
  formatDate,
  isClosedStage,
  ESTIMATE_INCLUDES,
  LONG_TEXT_MAX,
  PRIORITIES,
  STAGES,
  TEXT_MAX,
  TODO_ITEMS_MAX,
  TODO_STATES,
  VISIT_STATES,
  WORK_ITEMS_MAX,
  type ConsultFile,
  type TodoItem,
  type WorkItem,
} from "@/lib/consult-shared";
import { syncConsultEvents } from "@/lib/consult-calendar";
import { createNotices, scheduleChange, type NoticeDraft } from "@/lib/notices";
import type { Exclusion } from "@/lib/excluded-users";
import { normalizeSiteInput, type ActionResult } from "@/lib/sites";
import { fetchExistingSiteNumbers } from "@/lib/sites-data";
import { getSupabaseAdmin, SITES_TABLE } from "@/lib/supabase-admin";

// 고객상담 등록·수정·삭제와 연락 기록.
// RD와 관리자 이상이 사용한다. RD는 담당이 본인인 상담만 다루고(담당 RD는 항상 본인),
// 관리자 이상은 모든 상담을 다루며 담당 RD를 지정할 수 있다.

/** 로그인한 사람이 볼 수 있는 상담 범위 (RD는 본인 담당만) */
function viewOf(auth: { exclusion: Exclusion; scope: { salesName: string | null } }): ConsultView {
  return { ...auth.exclusion, salesName: auth.scope.salesName };
}

/** 저장 직후 캘린더 동기화용: 범위 제한 없이 읽는다 (권한 확인은 이미 끝난 뒤) */
const ALL_VIEW: ConsultView = { ids: [], names: [], salesName: null };

/** 상담노트의 일정을 캘린더에 다시 만든다. 실패하면 경고 문구 (상담 저장은 성공) */
async function syncCalendar(id: number): Promise<string | null> {
  const fresh = await fetchConsult(id, ALL_VIEW);
  return fresh ? syncConsultEvents(fresh) : null;
}

type NoticeFields = Pick<
  ConsultInput,
  "고객명" | "진행단계" | "영업사원" | "영업사원ID" | "할일" | "다음연락일" | "다음미팅일시" | "실측일시"
>;

/**
 * 담당 알림 (before가 null이면 신규 등록):
 * - 담당 RD·할 일 담당자로 새로 지정된 사람 → 지정 알림 (지금 잡힌 일정도 함께)
 * - 담당이 그대로인 사람 → 맡은 일정(연락·미팅·실측·할 일 예정일)이 등록·변경·삭제되면 일정 알림
 * 종료된 상담(보류·계약취소·상담종료)은 일정 알림을 보내지 않는다.
 */
async function notifyConsultChanges(id: number, before: NoticeFields | null, after: NoticeFields, actor: { uid: number; name: string }) {
  const name = after.고객명;
  const closed = isClosedStage(after.진행단계);
  const drafts: NoticeDraft[] = [];

  // 담당 RD: 연락·미팅·실측과 담당자 없는 할 일
  const rdKey = (c: NoticeFields | null) => c?.영업사원ID ?? c?.영업사원 ?? "";
  const rd = { sid: after.영업사원ID, name: after.영업사원 };
  const rdAssigned = rdKey(after) !== "" && (before === null || rdKey(before) !== rdKey(after));
  const rdParts: string[] = [];
  const pushRd = (label: string, b: string | null | undefined, a: string | null | undefined) => {
    // 새로 지정된 RD에게는 지금 잡힌 일정만, 그대로인 RD에게는 바뀐 일정만
    const change = rdAssigned ? (a ? scheduleChange(label, null, a) : null) : scheduleChange(label, b, a);
    if (change) rdParts.push(change);
  };
  if (!closed) {
    pushRd("연락일", before?.다음연락일, after.다음연락일);
    pushRd("미팅", before?.다음미팅일시, after.다음미팅일시);
    pushRd("실측", before?.실측일시, after.실측일시);
  }

  // 할 일: 내용으로 이전 항목을 찾는다
  const prevTodo = new Map((before?.할일 ?? []).map((t) => [t.내용.trim(), t] as const));
  const hadAssignee = new Set((before?.할일 ?? []).map((t) => t.담당자.trim()).filter(Boolean));
  const todoParts = new Map<string, string[]>(); // 담당자 이름 → 일정 변경
  for (const t of after.할일) {
    const who = t.담당자.trim();
    const prev = prevTodo.get(t.내용.trim());
    const done = t.상태 === "완료" || t.상태 === "보류";
    if (who && !hadAssignee.has(who)) {
      const when = t.예정일 && !closed && !done ? ` (${formatDate(t.예정일)})` : "";
      drafts.push({ assignee: { name: who }, message: `${name} 고객상담의 할 일 담당자로 지정되었습니다: ${t.내용}${when}` });
      continue;
    }
    if (closed || done) continue;
    const change = scheduleChange(`할 일 '${t.내용}'`, prev?.예정일, t.예정일);
    if (!change) continue;
    if (who) todoParts.set(who, [...(todoParts.get(who) ?? []), change]);
    else rdParts.push(change);
  }

  if (rdAssigned) {
    const extra = rdParts.length ? ` (${rdParts.join(", ")})` : "";
    drafts.push({ assignee: rd, message: `${name} 고객상담의 담당 RD로 지정되었습니다.${extra}` });
  } else if (rdParts.length && rdKey(after)) {
    drafts.push({ assignee: rd, message: `${name} 고객상담 일정: ${rdParts.join(", ")}` });
  }
  for (const [who, parts] of todoParts) {
    drafts.push({ assignee: { name: who }, message: `${name} 고객상담 일정: ${parts.join(", ")}` });
  }
  await createNotices("고객상담", id, drafts, actor);
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class FormError extends Error {}

function text(form: FormData, name: string, max = TEXT_MAX): string {
  const v = String(form.get(name) ?? "").replace(/\r\n/g, "\n").trim();
  if (v.length > max) throw new FormError(`${name}은(는) ${max.toLocaleString()}자 이내로 입력하세요`);
  return v;
}

/** 선택값 (비어 있으면 fallback) */
function choice(form: FormData, name: string, options: readonly string[], fallback: string): string {
  const v = text(form, name);
  if (!v) return fallback;
  if (!options.includes(v)) throw new FormError(`${name} 값이 올바르지 않습니다`);
  return v;
}

function date(form: FormData, name: string): string | null {
  const v = text(form, name);
  if (!v) return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new FormError(`${name}을(를) 확인하세요`);
  return v;
}

function dateTime(form: FormData, name: string): string | null {
  const v = text(form, name);
  if (!v) return null;
  if (!DATETIME_RE.test(v) || Number.isNaN(Date.parse(v))) throw new FormError(`${name}을(를) 확인하세요`);
  return v;
}

/** 숫자 (쉼표 허용, 비어 있으면 null) */
function number(form: FormData, name: string, { integer }: { integer: boolean }): number | null {
  const v = text(form, name).replace(/[,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e9 || (integer && !Number.isInteger(n))) {
    throw new FormError(`${name}은(는) ${integer ? "0 이상의 정수" : "0 이상의 숫자"}로 입력하세요`);
  }
  return n;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function pick(v: unknown, options: readonly string[]): string {
  return typeof v === "string" && options.includes(v) ? v : "";
}

function jsonList(form: FormData, name: string): unknown[] {
  const raw = String(form.get(name) ?? "[]");
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    throw new FormError(`${name} 값이 올바르지 않습니다`);
  }
}

function workItems(form: FormData): WorkItem[] {
  const items = jsonList(form, "공사항목")
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        항목: str(o.항목, 100),
        상세: str(o.상세, 1000),
        우선순위: pick(o.우선순위, PRIORITIES),
        견적반영: pick(o.견적반영, ESTIMATE_INCLUDES),
      };
    })
    .filter((w) => w.항목 || w.상세);
  if (items.length > WORK_ITEMS_MAX) throw new FormError(`희망 공사는 ${WORK_ITEMS_MAX}개까지 입력할 수 있습니다`);
  return items;
}

function todoItems(form: FormData): TodoItem[] {
  const items = jsonList(form, "할일")
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const due = str(o.예정일, 10);
      return {
        내용: str(o.내용, 500),
        담당자: str(o.담당자, 50),
        예정일: DATE_RE.test(due) ? due : "",
        상태: pick(o.상태, TODO_STATES) || TODO_STATES[0],
      };
    })
    .filter((t) => t.내용);
  if (items.length > TODO_ITEMS_MAX) throw new FormError(`할 일은 ${TODO_ITEMS_MAX}개까지 입력할 수 있습니다`);
  return items;
}

async function salesperson(form: FormData, view: ConsultView, sid: string) {
  // RD는 항상 본인
  if (view.salesName !== null) return { 영업사원: view.salesName, 영업사원ID: sid };
  const exclusion: Exclusion = view;
  const picked = text(form, "영업사원ID");
  if (!picked) return { 영업사원: null, 영업사원ID: null };
  const member = (await fetchConsultMembers(exclusion)).find((m) => m.영업사원ID === picked);
  if (!member) throw new FormError("담당 RD를 다시 선택하세요");
  return { 영업사원: member.이름, 영업사원ID: member.영업사원ID };
}

async function parseConsultForm(form: FormData, view: ConsultView, sid: string): Promise<ConsultInput> {
  const 고객명 = text(form, "고객명", 50);
  if (!고객명) throw new FormError("고객명을 입력하세요");
  const 연락처 = text(form, "연락처", 50);
  if (!연락처) throw new FormError("연락처를 입력하세요");
  const 시공예정월 = text(form, "시공예정월", 7);
  if (시공예정월 && !YM_RE.test(시공예정월)) throw new FormError("시공 예정월을 확인하세요");

  return {
    고객명,
    연락처,
    만난장소: text(form, "만난장소", 50),
    매장지점: text(form, "매장지점", 100),
    현장주소: text(form, "현장주소"),
    평형: number(form, "평형", { integer: false }),
    주택유형: text(form, "주택유형"),
    예산: number(form, "예산", { integer: true }),
    ...(await salesperson(form, view, sid)),
    상담일: date(form, "상담일") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
    시공예정월,
    진행단계: choice(form, "진행단계", STAGES, STAGES[0]),
    상담구분: choice(form, "상담구분", CONSULT_KINDS, CONSULT_KINDS[0]),
    연락상태: choice(form, "연락상태", CONTACT_STATES, CONTACT_STATES[0]),
    최근연락일: date(form, "최근연락일"),
    다음연락일: date(form, "다음연락일"),
    연락방법: choice(form, "연락방법", CONTACT_METHODS, ""),
    다음미팅일시: dateTime(form, "다음미팅일시"),
    미팅장소: text(form, "미팅장소"),
    미팅상태: choice(form, "미팅상태", VISIT_STATES, VISIT_STATES[0]),
    실측일시: dateTime(form, "실측일시"),
    실측상태: choice(form, "실측상태", VISIT_STATES, VISIT_STATES[0]),
    일정메모: text(form, "일정메모", LONG_TEXT_MAX),
    공사항목: workItems(form),
    전체공사: number(form, "전체공사", { integer: true }),
    금액구분: text(form, "금액구분", 50),
    예산별제안: text(form, "예산별제안", LONG_TEXT_MAX),
    견적자재안내: text(form, "견적자재안내", LONG_TEXT_MAX),
    상담핵심: text(form, "상담핵심", LONG_TEXT_MAX),
    할일: todoItems(form),
  };
}

function formFail(e: unknown): { ok: false; error: string } {
  return e instanceof FormError ? { ok: false, error: e.message } : fail(e);
}

export type SaveResult = { id: number; warning: string | null };

export async function createConsultAction(form: FormData): Promise<ActionResult<SaveResult>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  try {
    const input = await parseConsultForm(form, viewOf(auth), auth.sid);
    const id = await insertConsult(input, auth.uid);
    const warning = await syncCalendar(id);
    await notifyConsultChanges(id, null, input, { uid: auth.uid, name: auth.name });
    refresh();
    return { ok: true, data: { id, warning } };
  } catch (e) {
    return formFail(e);
  }
}

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

export async function updateConsultAction(id: number, form: FormData): Promise<ActionResult<SaveResult>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(id)) return { ok: false, error: "잘못된 상담 번호입니다" };
  try {
    const before = await fetchConsult(id, viewOf(auth));
    if (!before) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    const input = await parseConsultForm(form, viewOf(auth), auth.sid);
    await updateConsult(id, input);
    const warning = await syncCalendar(id);
    await notifyConsultChanges(id, before, input, { uid: auth.uid, name: auth.name });
    refresh();
    return { ok: true, data: { id, warning } };
  } catch (e) {
    return formFail(e);
  }
}

export async function deleteConsultAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(id)) return { ok: false, error: "잘못된 상담 번호입니다" };
  try {
    const consult = await fetchConsult(id, viewOf(auth));
    if (!consult) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    // 연락 기록·자동 등록 일정은 DB에서 함께 지워지고(on delete cascade), 첨부파일은 여기서 지운다
    await deleteConsult(id);
    await Promise.all(consult.첨부.map((f) => removeConsultFile(f.stored)));
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 연락 기록 추가. 상담노트의 최근 연락일·연락 방법도 함께 갱신하고,
 * 연락 결과·다음 연락일을 고르면 연락 상태·다음 연락일도 바꾼다.
 */
export async function addConsultRecordAction(consultId: number, form: FormData): Promise<ActionResult<{ warning: string | null }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(consultId)) return { ok: false, error: "잘못된 상담 번호입니다" };
  try {
    const consult = await fetchConsult(consultId, viewOf(auth));
    if (!consult) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };

    const 기록일시 = dateTime(form, "기록일시");
    if (!기록일시) return { ok: false, error: "기록일시를 입력하세요" };
    const 연락방법 = choice(form, "연락방법", CONTACT_METHODS, "");
    const 내용 = text(form, "내용", LONG_TEXT_MAX);
    if (!내용) return { ok: false, error: "내용을 입력하세요" };
    const 연락상태 = choice(form, "연락상태", CONTACT_STATES, "");
    const 다음연락일 = date(form, "다음연락일");

    await insertConsultRecord(consultId, { 기록일시, 연락방법, 내용 }, { uid: auth.uid, name: auth.name });

    const day = 기록일시.slice(0, 10);
    const latest = !consult.최근연락일 || consult.최근연락일 <= day;
    await updateConsult(consultId, {
      ...(latest ? { 최근연락일: day, ...(연락방법 ? { 연락방법 } : {}) } : {}),
      ...(연락상태 ? { 연락상태 } : {}),
      ...(다음연락일 ? { 다음연락일 } : {}),
    });
    // 다음 연락일이 바뀌면 캘린더의 연락 일정도 옮긴다
    const warning = 다음연락일 && 다음연락일 !== consult.다음연락일 ? await syncCalendar(consultId) : null;
    if (다음연락일) await notifyConsultChanges(consultId, consult, { ...consult, 다음연락일 }, { uid: auth.uid, name: auth.name });
    refresh();
    return { ok: true, data: { warning } };
  } catch (e) {
    return formFail(e);
  }
}

/** 연락 기록 삭제: 기록을 남긴 본인 또는 관리자 이상 */
export async function deleteConsultRecordAction(recordId: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(recordId)) return { ok: false, error: "잘못된 기록 번호입니다" };
  try {
    const record = await fetchConsultRecord(recordId);
    if (!record) return { ok: false, error: "기록을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (!(await fetchConsult(record.상담id, viewOf(auth)))) return { ok: false, error: "상담을 찾을 수 없습니다" };
    if (record.등록자 !== auth.uid && !auth.canApprove) return { ok: false, error: "본인이 남긴 기록만 삭제할 수 있습니다" };
    await deleteConsultRecord(recordId);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------- 현장으로 전환 ----------

/** 상담을 현장정보로 전환: 현장번호(직접 입력)로 현장을 만들고 상담과 연결한다 */
export async function convertConsultToSiteAction(consultId: number, form: FormData): Promise<ActionResult<{ 현장번호: string; warning: string | null }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(consultId)) return { ok: false, error: "잘못된 상담 번호입니다" };
  try {
    const c = await fetchConsult(consultId, viewOf(auth));
    if (!c) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (c.현장번호) return { ok: false, error: `이미 현장 ${c.현장번호}(으)로 전환된 상담입니다` };
    if (!c.영업사원) return { ok: false, error: "담당 RD를 먼저 지정하고 저장하세요" };

    const 현장번호 = text(form, "현장번호", 50);
    if (!현장번호) return { ok: false, error: "현장번호를 입력하세요" };
    const 계약일 = date(form, "계약일") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    // 견적에서 뺀 공사는 공사품목에 넣지 않는다
    const 공사품목 = c.공사항목
      .filter((w) => w.항목 && w.우선순위 !== "제외" && w.견적반영 !== "제외")
      .map((w) => w.항목)
      .join(", ");

    const { data, errors } = normalizeSiteInput({
      현장번호,
      고객명: c.고객명,
      고객전화번호: c.연락처,
      영업사원: c.영업사원,
      영업사원ID: c.영업사원ID,
      현장주소: c.현장주소,
      계약일,
      공사시기: c.시공예정월 ? `${c.시공예정월}-01` : null,
      공사품목: 공사품목 || null,
      정산여부: "미정산",
      특이사항: `고객상담 ${c.고객번호}에서 전환`,
    });
    if (errors.length) return { ok: false, error: errors.join("\n") };
    if ((await fetchExistingSiteNumbers([현장번호])).size > 0) return { ok: false, error: `현장번호 ${현장번호}은(는) 이미 등록되어 있습니다` };

    const row = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== ""));
    const { error } = await getSupabaseAdmin().from(SITES_TABLE).insert(row);
    if (error) return { ok: false, error: error.code === "23505" ? "이미 사용 중인 현장번호입니다" : `현장 등록 실패: ${error.message}` };

    // 계약 이후 단계가 아니면 '계약완료'로
    const stage = ["계약완료", "시공중", "시공완료"].includes(c.진행단계) ? c.진행단계 : "계약완료";
    await linkConsultSite(consultId, 현장번호, stage);
    const warning = await syncCalendar(consultId);
    refresh();
    return { ok: true, data: { 현장번호, warning } };
  } catch (e) {
    return formFail(e);
  }
}

// ---------- 첨부파일 ----------

/** 첨부파일 한 개 올리기 (여러 개는 화면에서 하나씩 보낸다) */
export async function uploadConsultFileAction(consultId: number, formData: FormData): Promise<ActionResult<ConsultFile[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(consultId)) return { ok: false, error: "잘못된 상담 번호입니다" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 선택하세요" };
  if (file.size > CONSULT_FILE_MAX_BYTES) return { ok: false, error: `${file.name}: 파일은 20MB까지 올릴 수 있습니다` };
  if (isBlockedFile(file.name)) return { ok: false, error: `${file.name}: 실행 파일 형식은 올릴 수 없습니다` };
  try {
    const c = await fetchConsult(consultId, viewOf(auth));
    if (!c) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (c.첨부.length >= CONSULT_FILES_MAX) return { ok: false, error: `첨부파일은 ${CONSULT_FILES_MAX}개까지 올릴 수 있습니다` };
    const info = await writeConsultFile(file, auth.name);
    const files = [...c.첨부, info];
    try {
      await setConsultFiles(consultId, files);
    } catch (e) {
      await removeConsultFile(info.stored); // DB 저장에 실패하면 방금 쓴 파일을 지운다
      throw e;
    }
    refresh();
    return { ok: true, data: files };
  } catch (e) {
    return fail(e);
  }
}

/** 첨부파일 삭제: 올린 본인 또는 관리자 이상 */
export async function deleteConsultFileAction(consultId: number, stored: string): Promise<ActionResult<ConsultFile[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(consultId) || typeof stored !== "string") return { ok: false, error: "잘못된 요청입니다" };
  try {
    const c = await fetchConsult(consultId, viewOf(auth));
    if (!c) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    const target = c.첨부.find((f) => f.stored === stored);
    if (!target) return { ok: false, error: "파일을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (target.by !== auth.name && !auth.canApprove) return { ok: false, error: "본인이 올린 파일만 삭제할 수 있습니다" };
    const files = c.첨부.filter((f) => f.stored !== stored);
    await setConsultFiles(consultId, files);
    await removeConsultFile(stored);
    refresh();
    return { ok: true, data: files };
  } catch (e) {
    return fail(e);
  }
}

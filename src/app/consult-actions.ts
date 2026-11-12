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
  updateConsult,
  type ConsultInput,
  type ConsultView,
} from "@/lib/consult";
import {
  CONSULT_KINDS,
  CONTACT_METHODS,
  CONTACT_STATES,
  ESTIMATE_INCLUDES,
  LONG_TEXT_MAX,
  PRIORITIES,
  STAGES,
  TEXT_MAX,
  TODO_ITEMS_MAX,
  TODO_STATES,
  VISIT_STATES,
  WORK_ITEMS_MAX,
  type TodoItem,
  type WorkItem,
} from "@/lib/consult-shared";
import type { Exclusion } from "@/lib/excluded-users";
import type { ActionResult } from "@/lib/sites";

// 고객상담 등록·수정·삭제와 연락 기록.
// RD와 관리자 이상이 사용한다. RD는 담당이 본인인 상담만 다루고(담당 RD는 항상 본인),
// 관리자 이상은 모든 상담을 다루며 담당 RD를 지정할 수 있다.

/** 로그인한 사람이 볼 수 있는 상담 범위 (RD는 본인 담당만) */
function viewOf(auth: { exclusion: Exclusion; scope: { salesName: string | null } }): ConsultView {
  return { ...auth.exclusion, salesName: auth.scope.salesName };
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

export async function createConsultAction(form: FormData): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  try {
    const input = await parseConsultForm(form, viewOf(auth), auth.sid);
    const id = await insertConsult(input, auth.uid);
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return formFail(e);
  }
}

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

export async function updateConsultAction(id: number, form: FormData): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canUseConsult) return { ok: false, error: "고객상담을 사용할 권한이 없습니다" };
  if (!validId(id)) return { ok: false, error: "잘못된 상담 번호입니다" };
  try {
    if (!(await fetchConsult(id, viewOf(auth)))) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    const input = await parseConsultForm(form, viewOf(auth), auth.sid);
    await updateConsult(id, input);
    refresh();
    return { ok: true, data: { id } };
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
    if (!(await fetchConsult(id, viewOf(auth)))) return { ok: false, error: "상담을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    await deleteConsult(id);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 연락 기록 추가. 상담노트의 최근 연락일·연락 방법도 함께 갱신하고,
 * 연락 결과·다음 연락일을 고르면 연락 상태·다음 연락일도 바꾼다.
 */
export async function addConsultRecordAction(consultId: number, form: FormData): Promise<ActionResult<null>> {
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
    refresh();
    return { ok: true, data: null };
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

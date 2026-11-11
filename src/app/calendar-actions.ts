"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import { deleteEvent, fetchEvent, insertEvent, updateEvent, type EventInput } from "@/lib/calendar";
import {
  EVENT_KIND_PERSONAL,
  EVENT_KIND_SHARED,
  EVENT_MEMO_MAX,
  EVENT_TITLE_MAX,
  isEventColor,
  isValidDate,
  isValidTime,
} from "@/lib/calendar-shared";
import type { ActionResult } from "@/lib/sites";

// 팀 캘린더 일정 등록·수정·삭제.
// 일정은 항상 로그인한 본인의 것으로 등록되고, 수정·삭제도 본인 일정만 할 수 있다 (공용 일정도 등록한 사람만).

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function parseForm(form: FormData): EventInput | string {
  const title = String(form.get("title") ?? "").trim();
  const memo = String(form.get("memo") ?? "").replace(/\r\n/g, "\n").trimEnd();
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "") || startDate;
  const allDay = form.get("allDay") === "on";
  const startTime = allDay ? "" : String(form.get("startTime") ?? "");
  const endTime = allDay ? "" : String(form.get("endTime") ?? "");

  if (!title) return "제목을 입력하세요";
  if (title.length > EVENT_TITLE_MAX) return `제목은 ${EVENT_TITLE_MAX}자 이내로 입력하세요`;
  if (memo.length > EVENT_MEMO_MAX) return `메모는 ${EVENT_MEMO_MAX.toLocaleString()}자 이내로 입력하세요`;
  if (!isValidDate(startDate)) return "시작일을 확인하세요";
  if (!isValidDate(endDate)) return "종료일을 확인하세요";
  if (endDate < startDate) return "종료일이 시작일보다 빠릅니다";
  if (!allDay) {
    if (!isValidTime(startTime)) return "시작시간을 입력하세요 (종일 일정이면 '종일'을 체크하세요)";
    if (endTime && !isValidTime(endTime)) return "종료시간을 확인하세요";
    if (endTime && startDate === endDate && endTime < startTime) return "종료시간이 시작시간보다 빠릅니다";
  }
  const shared = form.get("kind") === EVENT_KIND_SHARED;
  const color = form.get("color");
  return {
    제목: title,
    메모: memo,
    구분: shared ? EVENT_KIND_SHARED : EVENT_KIND_PERSONAL,
    // 색은 개인 일정에만. 공용 일정은 항상 공용 색으로 보인다
    색상: !shared && isEventColor(color) ? color : null,
    시작일: startDate,
    종료일: endDate,
    시작시간: startTime || null,
    종료시간: endTime || null,
  };
}

export async function createEventAction(form: FormData): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const parsed = parseForm(form);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  try {
    const id = await insertEvent(auth.uid, parsed);
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

async function loadOwnEvent(id: number, uid: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return "잘못된 일정 번호입니다";
  const event = await fetchEvent(id);
  if (!event) return "일정을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)";
  if (event.ownerId !== uid) return "본인 일정만 수정·삭제할 수 있습니다";
  return event;
}

export async function updateEventAction(id: number, form: FormData): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const parsed = parseForm(form);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  try {
    const event = await loadOwnEvent(id, auth.uid);
    if (typeof event === "string") return { ok: false, error: event };
    await updateEvent(id, parsed);
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEventAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  try {
    const event = await loadOwnEvent(id, auth.uid);
    if (typeof event === "string") return { ok: false, error: event };
    await deleteEvent(id);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

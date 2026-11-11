import "server-only";

// 팀 캘린더: 일정은 Supabase '일정' 테이블, 팀원 목록은 '권한' 테이블에서 읽는다.

import { EVENT_KIND_SHARED, type CalendarEvent, type CalendarMember } from "@/lib/calendar-shared";
import { AUTH_TABLE, CALENDAR_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

type EventRecord = {
  id: number;
  사용자: number;
  제목: string;
  메모: string;
  구분: string;
  색상: string | null;
  시작일: string;
  종료일: string;
  시작시간: string | null;
  종료시간: string | null;
};

export type EventInput = {
  제목: string;
  메모: string;
  구분: "개인" | "공용";
  색상: string | null;
  시작일: string;
  종료일: string;
  시작시간: string | null;
  종료시간: string | null;
};

const COLUMNS = "id, 사용자, 제목, 메모, 구분, 색상, 시작일, 종료일, 시작시간, 종료시간";

function tableError(label: string, message: string): Error {
  if (/schema cache|does not exist/i.test(message)) {
    return new Error(`${label} 실패: 일정 테이블(또는 컬럼)이 없습니다. doc/일정.sql을 Supabase SQL Editor에서 실행해 주세요.`);
  }
  return new Error(`${label} 실패: ${message}`);
}

function toEvent(r: EventRecord): CalendarEvent {
  return {
    id: r.id,
    ownerId: r.사용자,
    title: r.제목,
    memo: r.메모,
    startDate: r.시작일,
    endDate: r.종료일,
    // Postgres time은 "HH:MM:SS"로 온다
    startTime: r.시작시간?.slice(0, 5) ?? null,
    endTime: r.종료시간?.slice(0, 5) ?? null,
    shared: r.구분 === EVENT_KIND_SHARED,
    color: r.색상,
  };
}

/** 캘린더에서 고를 수 있는 팀원 (권한 테이블 전체, 이름순) */
export async function fetchCalendarMembers(): Promise<CalendarMember[]> {
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select("id, 영업사원ID, 이름");
  if (error) throw new Error(`팀원 목록 조회 실패: ${error.message}`);
  return ((data ?? []) as unknown as { id: number; 영업사원ID: string; 이름: string | null }[])
    .map((r) => ({ id: r.id, name: r.이름?.trim() || r.영업사원ID }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id - b.id);
}

/** [from, to] 기간과 겹치는 일정: 지정한 사람들의 일정 + 모든 공용 일정 */
export async function fetchEvents(ownerIds: number[], from: string, to: string): Promise<CalendarEvent[]> {
  const ids = ownerIds.filter((id) => Number.isSafeInteger(id));
  const owners = ids.length ? `사용자.in.(${ids.join(",")}),` : "";
  const { data, error } = await getSupabaseAdmin()
    .from(CALENDAR_TABLE)
    .select(COLUMNS)
    .or(`${owners}구분.eq.${EVENT_KIND_SHARED}`)
    .lte("시작일", to)
    .gte("종료일", from)
    .order("시작일")
    .limit(2000);
  if (error) throw tableError("일정 조회", error.message);
  return ((data ?? []) as unknown as EventRecord[]).map(toEvent);
}

export async function fetchEvent(id: number): Promise<CalendarEvent | null> {
  const { data, error } = await getSupabaseAdmin().from(CALENDAR_TABLE).select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw tableError("일정 조회", error.message);
  return data ? toEvent(data as unknown as EventRecord) : null;
}

export async function insertEvent(ownerId: number, row: EventInput): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from(CALENDAR_TABLE)
    .insert({ ...row, 사용자: ownerId })
    .select("id")
    .single();
  if (error) throw tableError("일정 등록", error.message);
  return (data as { id: number }).id;
}

export async function updateEvent(id: number, row: EventInput): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(CALENDAR_TABLE)
    .update({ ...row, 수정일시: new Date().toISOString() })
    .eq("id", id);
  if (error) throw tableError("일정 수정", error.message);
}

export async function deleteEvent(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from(CALENDAR_TABLE).delete().eq("id", id);
  if (error) throw tableError("일정 삭제", error.message);
}

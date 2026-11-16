import "server-only";

import { addDays, type AttendanceKind, type AttendanceRecord, type PlaceType } from "@/lib/attendance-shared";
import { ATTENDANCE_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

/** 한국 날짜 YYYY-MM-DD */
export function todayKst(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10);
}

/** 한국 날짜 기준 다음 날 YYYY-MM-DD */
export function tomorrowKst(): string {
  return addDays(todayKst(), 1);
}

/** 내 근태 기록 (최근 근무일부터, 최대 limit건) */
export async function fetchMyAttendance(uid: number, limit = 60): Promise<AttendanceRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(ATTENDANCE_TABLE)
    .select("id, 구분, 장소구분, 장소, 현장번호, 근무일, 기록일시")
    .eq("사용자", uid)
    .order("기록일시", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`근태 기록 조회 실패: ${error.message}`);
  return data as unknown as AttendanceRecord[];
}

export async function insertAttendance(row: {
  사용자: number;
  이름: string;
  구분: AttendanceKind;
  장소구분: PlaceType;
  장소: string;
  현장번호: string | null;
}): Promise<AttendanceRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from(ATTENDANCE_TABLE)
    .insert({ ...row, 근무일: row.구분 === "출근예정" ? tomorrowKst() : todayKst() })
    .select("id, 구분, 장소구분, 장소, 현장번호, 근무일, 기록일시")
    .single();
  if (error) throw new Error(`근태 기록 저장 실패: ${error.message}`);
  return data as unknown as AttendanceRecord;
}

/** 본인 기록만 삭제한다. 지운 행이 없으면 false */
export async function deleteAttendance(uid: number, id: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(ATTENDANCE_TABLE)
    .delete()
    .eq("id", id)
    .eq("사용자", uid)
    .select("id");
  if (error) throw new Error(`근태 기록 삭제 실패: ${error.message}`);
  return (data ?? []).length > 0;
}

export type TeamAttendanceRow = AttendanceRecord & { 사용자: number };

/** 팀원 출근현황: 근무일이 [from, to]인 모든 사람의 기록 (기록 순서대로) */
export async function fetchTeamAttendance(from: string, to: string): Promise<TeamAttendanceRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(ATTENDANCE_TABLE)
    .select("id, 사용자, 구분, 장소구분, 장소, 현장번호, 근무일, 기록일시")
    .gte("근무일", from)
    .lte("근무일", to)
    .order("기록일시", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`팀원 근태 조회 실패: ${error.message}`);
  return data as unknown as TeamAttendanceRow[];
}

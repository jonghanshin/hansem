"use server";

import { refresh } from "next/cache";

import { deleteAttendance, insertAttendance } from "@/lib/attendance";
import { isAttendanceKind, isPlaceType, PLACE_MEMO_MAX, type AttendanceRecord } from "@/lib/attendance-shared";
import { authorizeAction } from "@/lib/auth";
import type { ActionResult } from "@/lib/sites";
import { fetchSites } from "@/lib/sites-data";

// 근태관리: 출근·퇴근 기록. 항상 로그인한 본인의 기록으로 저장한다.

export async function recordAttendanceAction(input: {
  kind: string;
  placeType: string;
  siteNumber?: string;
  memo?: string;
}): Promise<ActionResult<AttendanceRecord>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!isAttendanceKind(input.kind)) return { ok: false, error: "출근/퇴근 구분이 올바르지 않습니다" };
  if (!isPlaceType(input.placeType)) return { ok: false, error: "장소를 선택하세요" };

  let place: string = input.placeType;
  let siteNumber: string | null = null;
  try {
    if (input.placeType === "현장") {
      const num = input.siteNumber?.trim();
      if (!num) return { ok: false, error: "현장을 선택하세요" };
      // 본인이 영업사원인 진행 중 현장만 선택할 수 있다
      const sites = await fetchSites({ ...auth.scope, salesName: auth.name });
      const site = sites.find((s) => s.현장번호 === num && !s.완료일);
      if (!site) return { ok: false, error: "진행 중인 내 현장이 아닙니다" };
      siteNumber = num;
      place = [num, site.고객명].filter(Boolean).join(" ");
    } else if (input.placeType === "기타") {
      const memo = (input.memo ?? "").trim();
      if (!memo) return { ok: false, error: "장소를 입력하세요" };
      if (memo.length > PLACE_MEMO_MAX) return { ok: false, error: `장소는 ${PLACE_MEMO_MAX}자 이내로 입력하세요` };
      place = memo;
    }

    const record = await insertAttendance({
      사용자: auth.uid,
      이름: auth.name,
      구분: input.kind,
      장소구분: input.placeType,
      장소: place,
      현장번호: siteNumber,
    });
    refresh();
    return { ok: true, data: record };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 내 근태 기록 삭제 (본인 기록만) */
export async function deleteAttendanceAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청입니다" };
  try {
    if (!(await deleteAttendance(auth.uid, id))) return { ok: false, error: "삭제할 기록을 찾지 못했습니다" };
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

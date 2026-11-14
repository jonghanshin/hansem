import "server-only";

// 상담노트 → 팀 캘린더 자동 등록.
// 상담노트를 저장할 때마다 그 상담에서 만든 일정('일정.상담id')을 모두 지우고 지금 값으로 다시 만든다.
// - 다음 연락일 → 담당 RD의 종일 일정 (진행 중인 상담만)
// - 다음 미팅 일시 · 실측 일시 → 담당 RD의 일정 (취소 상태 제외)
// - 할 일 예정일 → 할 일 담당자(이름이 권한 테이블에 있으면 그 사람, 없으면 담당 RD)의 종일 일정 (완료·보류 제외)
// 일정은 개인 일정이라 본인과, 캘린더에서 그 사람을 선택한 팀원에게 보인다.

import { EVENT_KIND_PERSONAL, EVENT_TITLE_MAX } from "@/lib/calendar-shared";
import { isActiveStage, isClosedStage, type Consult } from "@/lib/consult-shared";
import { fetchAuthDirectory } from "@/lib/auth-directory";
import { CALENDAR_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

type EventRow = {
  사용자: number;
  제목: string;
  메모: string;
  구분: string;
  색상: string;
  시작일: string;
  종료일: string;
  시작시간: string | null;
  종료시간: string | null;
  상담id: number;
};

const clip = (s: string) => (s.length > EVENT_TITLE_MAX ? `${s.slice(0, EVENT_TITLE_MAX - 1)}…` : s);

/** 상담노트의 일정을 캘린더에 다시 만든다. 실패하면 오류 문구를 돌려준다 (상담 저장은 이미 끝난 뒤) */
export async function syncConsultEvents(c: Consult): Promise<string | null> {
  try {
    const sb = getSupabaseAdmin();
    const rows = await fetchAuthDirectory();
    const byName = (name: string) => rows.find((p) => p.이름 === name.trim())?.id ?? null;
    const rd =
      rows.find((p) => c.영업사원ID && p.영업사원ID === c.영업사원ID)?.id ?? (c.영업사원 ? byName(c.영업사원) : null);

    const memo = `고객상담 ${c.고객번호} (${c.고객명}) · 상담노트에서 자동 등록된 일정입니다.`;
    const events: EventRow[] = [];
    const add = (owner: number | null, title: string, color: string, at: string, withTime: boolean) => {
      if (owner === null) return;
      const date = at.slice(0, 10);
      events.push({
        사용자: owner,
        제목: clip(title),
        메모: memo,
        구분: EVENT_KIND_PERSONAL,
        색상: color,
        시작일: date,
        종료일: date,
        시작시간: withTime && at.length >= 16 ? at.slice(11, 16) : null,
        종료시간: null,
        상담id: c.id,
      });
    };

    const closed = isClosedStage(c.진행단계);
    if (isActiveStage(c.진행단계) && c.다음연락일) add(rd, `📞 ${c.고객명} 연락`, "amber", c.다음연락일, false);
    if (!closed && c.다음미팅일시 && c.미팅상태 !== "취소") {
      add(rd, `🤝 ${c.고객명} 미팅${c.미팅장소 ? ` (${c.미팅장소})` : ""}`, "cyan", c.다음미팅일시, true);
    }
    if (!closed && c.실측일시 && c.실측상태 !== "취소") add(rd, `📐 ${c.고객명} 실측`, "violet", c.실측일시, true);
    if (!closed) {
      for (const t of c.할일) {
        if (!t.예정일 || t.상태 === "완료" || t.상태 === "보류") continue;
        add((t.담당자 && byName(t.담당자)) || rd, `✅ ${c.고객명}: ${t.내용}`, "teal", t.예정일, false);
      }
    }

    const { error: deleteError } = await sb.from(CALENDAR_TABLE).delete().eq("상담id", c.id);
    if (deleteError) throw new Error(deleteError.message);
    if (events.length) {
      const { error } = await sb.from(CALENDAR_TABLE).insert(events);
      if (error) throw new Error(error.message);
    }
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[consult-calendar]", c.id, message);
    return /schema cache|does not exist|상담id/i.test(message)
      ? "캘린더 자동 등록 실패: doc/상담노트_2단계.sql을 실행해 주세요."
      : `캘린더 자동 등록 실패: ${message}`;
  }
}

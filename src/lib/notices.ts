import "server-only";

// 담당 알림: 고객상담(담당 RD·할 일 담당자), A/S(담당자)로 지정·변경되거나
// 맡은 일의 일정(연락·미팅·실측·할 일 예정일 / 방문·처리기한)이 등록·변경되면 그 사람에게 남기고,
// 그 사람이 로그인하면 상단 메뉴·첫 화면에 보여 준다.
// 관리자 이상(CEO·관리자·슈퍼관리자)과 직접 지정한 본인에게는 남기지 않는다.
// 알림은 부가 기능이므로 저장에 실패해도 상담·A/S 저장에는 영향을 주지 않는다 (오류는 서버 로그에만).

import { fetchAuthDirectory } from "@/lib/auth-directory";
import { formatDateTime } from "@/lib/consult-shared";
import { APPROVER_ROLES } from "@/lib/data-scope";
import { getSupabaseAdmin, NOTICE_TABLE } from "@/lib/supabase-admin";

export type NoticeKind = "고객상담" | "A/S";

export type Notice = {
  id: number;
  kind: NoticeKind;
  targetId: number;
  message: string;
  by: string;
  createdAt: string;
  read: boolean;
};

type Row = { id: number; 구분: string; 대상id: number; 내용: string; 등록자: string; 등록일시: string; 읽은일시: string | null };

/** 알림을 받을 사람: 영업사원ID 또는 이름으로 찾는다 */
export type Assignee = { sid?: string | null; name?: string | null };

export type NoticeDraft = { assignee: Assignee; message: string };

/**
 * 일정 한 항목의 변경 문구. 바뀌지 않았으면 null.
 * 예) "미팅 11/20(목) 14:00 등록", "실측 11/22(토) 10:00로 변경", "연락일 삭제"
 */
export function scheduleChange(label: string, before: string | null | undefined, after: string | null | undefined): string | null {
  const b = before?.trim() || null;
  const a = after?.trim() || null;
  if (a === b) return null;
  if (!a) return `${label} 삭제`;
  return `${label} ${formatDateTime(a)}${b ? "로 변경" : " 등록"}`;
}

/** 알림 대상이 아닌 역할 (관리자 이상) */
const isManager = (role: string) => APPROVER_ROLES.includes(role.trim());

export function noticeHref(kind: NoticeKind, targetId: number): string {
  return kind === "A/S" ? `/as/${targetId}` : `/consult/${targetId}`;
}

/** 담당자 알림을 남긴다. actor(지정한 사람) 본인과 관리자 이상은 뺀다 */
export async function createNotices(
  kind: NoticeKind,
  targetId: number,
  drafts: NoticeDraft[],
  actor: { uid: number; name: string },
): Promise<void> {
  if (!drafts.length) return;
  try {
    const directory = await fetchAuthDirectory();
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const { assignee, message } of drafts) {
      const sid = assignee.sid?.trim();
      const name = assignee.name?.trim();
      const bySid = sid ? directory.filter((u) => u.영업사원ID === sid) : [];
      const users = bySid.length ? bySid : name ? directory.filter((u) => u.이름 === name) : [];
      for (const u of users) {
        if (u.id === actor.uid || isManager(u.역할)) continue;
        const key = `${u.id}|${message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ 사용자: u.id, 구분: kind, 대상id: targetId, 내용: message.slice(0, 300), 등록자: actor.name });
      }
    }
    if (!rows.length) return;
    const { error } = await getSupabaseAdmin().from(NOTICE_TABLE).insert(rows);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(`[알림:${kind}]`, targetId, e instanceof Error ? e.message : e);
  }
}

/** 안 읽은 알림 수 (테이블이 없거나 조회에 실패하면 0) */
export async function countUnreadNotices(uid: number): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(NOTICE_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("사용자", uid)
    .is("읽은일시", null);
  if (error) {
    console.error("[알림] 건수 조회 실패:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** 최근 알림 (안 읽은 것만 고를 수 있다) */
export async function fetchNotices(uid: number, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notice[]> {
  let query = getSupabaseAdmin()
    .from(NOTICE_TABLE)
    .select("id, 구분, 대상id, 내용, 등록자, 등록일시, 읽은일시")
    .eq("사용자", uid);
  if (opts.unreadOnly) query = query.is("읽은일시", null);
  const { data, error } = await query.order("등록일시", { ascending: false }).limit(opts.limit ?? 100);
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      throw new Error("알림 테이블이 없습니다. doc/알림.sql을 Supabase SQL Editor에서 실행해 주세요.");
    }
    throw new Error(`알림 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    kind: r.구분 === "A/S" ? "A/S" : "고객상담",
    targetId: r.대상id,
    message: r.내용,
    by: r.등록자,
    createdAt: r.등록일시,
    read: r.읽은일시 !== null,
  }));
}

/** 알림 하나를 읽음 처리하고 그 알림을 돌려준다 (본인 알림만) */
export async function readNotice(uid: number, id: number): Promise<Pick<Notice, "kind" | "targetId"> | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(NOTICE_TABLE)
    .update({ 읽은일시: new Date().toISOString() })
    .eq("id", id)
    .eq("사용자", uid)
    .select("구분, 대상id")
    .maybeSingle();
  if (error) throw new Error(`알림 읽음 처리 실패: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as Pick<Row, "구분" | "대상id">;
  return { kind: r.구분 === "A/S" ? "A/S" : "고객상담", targetId: r.대상id };
}

/** 내 알림을 모두 읽음 처리 */
export async function readAllNotices(uid: number): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(NOTICE_TABLE)
    .update({ 읽은일시: new Date().toISOString() })
    .eq("사용자", uid)
    .is("읽은일시", null);
  if (error) throw new Error(`알림 읽음 처리 실패: ${error.message}`);
}

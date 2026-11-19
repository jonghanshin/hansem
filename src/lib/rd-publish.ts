import "server-only";

import type { SettlementWithCarryIn } from "@/app/settlement-actions";
import { RESTRICTED_ROLE } from "@/lib/data-scope";
import type { SessionPayload } from "@/lib/session-token";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// 정산 RD게시: 관리자가 정산결과를 저장한 뒤 게시하면, 그 영업사원(RD)은 게시 기간 동안만
// 정산 메뉴에서 게시된 정산결과를 본다.

export const RD_PUBLISH_TABLE = "RD게시";

/** 게시 목록·상태 확인에 쓰는 컬럼 (게시한 정산결과 JSON은 RD 화면에서만 읽는다) */
export const RD_PUBLISH_COLUMNS = "id, 영업사원, 영업사원ID, 정산월, 시작일, 종료일, 게시자, 수정일시";

export type RdPublish = {
  id: number;
  영업사원: string;
  영업사원ID: string | null;
  정산월: string;
  /** YYYY-MM-DD (포함) */
  시작일: string;
  /** YYYY-MM-DD (포함) */
  종료일: string;
  게시자: string | null;
  수정일시: string;
};

/** RD 화면용: 게시 정보 + 게시할 때 저장한 정산결과 */
export type RdPublishWithResult = RdPublish & { 결과: SettlementWithCarryIn | null };

/** 오늘 한국 날짜 (YYYY-MM-DD) */
export function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** RD 로그인이고 오늘이 게시 기간 안인 게시를 찾는 쿼리 (여러 개면 가장 최근에 시작한 것) */
function activeQuery(name: string, columns: string) {
  const today = todayKst();
  return getSupabaseAdmin()
    .from(RD_PUBLISH_TABLE)
    .select(columns)
    .eq("영업사원", name)
    .lte("시작일", today)
    .gte("종료일", today)
    .order("시작일", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
}

const isRd = (session: Pick<SessionPayload, "role"> | null) => !!session && session.role.trim() === RESTRICTED_ROLE;

/** RD 화면용: 오늘 볼 수 있는 게시와 그 정산결과 (없으면 null) */
export async function fetchActiveRdPublish(
  session: Pick<SessionPayload, "role" | "name"> | null,
): Promise<RdPublishWithResult | null> {
  if (!session || !isRd(session)) return null;
  const { data, error } = await activeQuery(session.name, `${RD_PUBLISH_COLUMNS}, 결과`);
  if (error) throw new Error(`RD게시 조회 실패: ${error.message}`);
  return (data as unknown as RdPublishWithResult[])[0] ?? null;
}

/** 메뉴 표시용: 조회에 실패하면(테이블이 아직 없는 경우 등) 게시 없음으로 본다 */
export async function hasActiveRdPublish(session: Pick<SessionPayload, "role" | "name"> | null): Promise<boolean> {
  if (!session || !isRd(session)) return false;
  const { data, error } = await activeQuery(session.name, "id");
  return !error && (data?.length ?? 0) > 0;
}

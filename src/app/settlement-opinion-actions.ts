"use server";

import { authorizeAction } from "@/lib/auth";
import { RESTRICTED_ROLE } from "@/lib/data-scope";
import { fetchActiveRdPublish } from "@/lib/rd-publish";
import { OPINION_MAX_LENGTH, opinionKey, unansweredCount, type SettlementOpinion } from "@/lib/settlement-opinions-shared";
import type { ActionResult } from "@/lib/sites";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// 정산의견: RD게시 기간에 RD가 정산결과에 대한 의견을 등록하고, 관리자가 응답한다 (영업사원·정산월별)

const OPINION_TABLE = "정산의견";
const COLUMNS = "id, created_at, 영업사원, 정산월, 구분, 작성자, 내용, 부모id";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Auth = Extract<Awaited<ReturnType<typeof authorizeAction>>, { ok: true }>;

/**
 * 이 영업사원·정산월의 의견을 다룰 수 있는지. 관리자 이상은 전부,
 * RD는 본인 것이고 오늘이 그 정산월의 게시 기간 안일 때만.
 */
async function canAccess(auth: Auth, 영업사원: string, 정산월: string): Promise<string | null> {
  if (auth.canApprove) return null;
  const name = auth.scope.salesName;
  if (!name || name !== 영업사원) return "권한이 없습니다";
  const publish = await fetchActiveRdPublish({ role: RESTRICTED_ROLE, name });
  if (!publish || publish.정산월 !== 정산월) return "게시 기간이 끝나 의견을 볼 수 없습니다";
  return null;
}

function cleanKey(영업사원: unknown, 정산월: unknown): { 영업사원: string; 정산월: string } | null {
  const a = String(영업사원 ?? "").trim();
  const b = String(정산월 ?? "").trim();
  return a && b ? { 영업사원: a, 정산월: b } : null;
}

/** 영업사원·정산월의 의견과 응답 (등록 순) */
export async function listSettlementOpinionsAction(
  영업사원: string,
  정산월: string,
): Promise<ActionResult<SettlementOpinion[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const key = cleanKey(영업사원, 정산월);
  if (!key) return { ok: false, error: "영업사원과 정산월이 필요합니다" };
  try {
    const denied = await canAccess(auth, key.영업사원, key.정산월);
    if (denied) return { ok: false, error: denied };
    const { data, error } = await getSupabaseAdmin()
      .from(OPINION_TABLE)
      .select(COLUMNS)
      .eq("영업사원", key.영업사원)
      .eq("정산월", key.정산월)
      .order("id", { ascending: true })
      .limit(500);
    if (error) return { ok: false, error: `의견 조회 실패: ${error.message}` };
    return { ok: true, data: data as unknown as SettlementOpinion[] };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/**
 * 의견 등록. RD는 의견(부모 없음)만, 관리자는 RD 의견에 대한 응답(부모id 필수)만 등록한다.
 */
export async function addSettlementOpinionAction(input: {
  영업사원: string;
  정산월: string;
  내용: string;
  부모id?: number | null;
}): Promise<ActionResult<SettlementOpinion>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const key = cleanKey(input?.영업사원, input?.정산월);
  if (!key) return { ok: false, error: "영업사원과 정산월이 필요합니다" };
  const 내용 = String(input.내용 ?? "").replace(/\r\n?/g, "\n").trim();
  if (!내용) return { ok: false, error: "내용을 입력하세요" };
  if (내용.length > OPINION_MAX_LENGTH) return { ok: false, error: `${OPINION_MAX_LENGTH}자 이내로 입력하세요` };
  const 부모id = input.부모id ?? null;
  try {
    const denied = await canAccess(auth, key.영업사원, key.정산월);
    if (denied) return { ok: false, error: denied };
    const sb = getSupabaseAdmin();
    if (auth.canApprove) {
      // 관리자는 같은 영업사원·정산월의 RD 의견에만 응답한다
      if (!Number.isSafeInteger(부모id) || (부모id as number) <= 0) return { ok: false, error: "응답할 의견을 고르세요" };
      const { data: parent, error: parentError } = await sb
        .from(OPINION_TABLE)
        .select("id, 영업사원, 정산월, 구분, 부모id")
        .eq("id", 부모id as number)
        .maybeSingle();
      if (parentError) return { ok: false, error: `의견 조회 실패: ${parentError.message}` };
      const p = parent as { 영업사원: string; 정산월: string; 구분: string; 부모id: number | null } | null;
      if (!p || p.영업사원 !== key.영업사원 || p.정산월 !== key.정산월 || p.구분 !== "RD" || p.부모id !== null) {
        return { ok: false, error: "응답할 의견을 찾을 수 없습니다 (삭제되었을 수 있습니다)" };
      }
    } else if (부모id !== null) {
      return { ok: false, error: "RD는 의견만 등록할 수 있습니다" };
    }
    const { data, error } = await sb
      .from(OPINION_TABLE)
      .insert({
        영업사원: key.영업사원,
        정산월: key.정산월,
        구분: auth.canApprove ? "관리자" : "RD",
        작성자ID: auth.uid,
        작성자: auth.name,
        내용,
        부모id: auth.canApprove ? 부모id : null,
      })
      .select(COLUMNS)
      .single();
    if (error) return { ok: false, error: `의견 등록 실패: ${error.message}` };
    return { ok: true, data: data as unknown as SettlementOpinion };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** 관리자 이상 전용: 영업사원·정산월별 응답 대기 중인 RD 의견 수 (키: "영업사원|정산월") */
export async function countUnansweredOpinionsAction(): Promise<ActionResult<Record<string, number>>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!auth.canApprove) return { ok: false, error: "권한이 없습니다" };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(OPINION_TABLE)
      .select("id, 영업사원, 정산월, 구분, 부모id")
      .order("id", { ascending: false })
      .limit(5000);
    if (error) return { ok: false, error: `의견 조회 실패: ${error.message}` };
    const groups = new Map<string, SettlementOpinion[]>();
    for (const o of data as unknown as SettlementOpinion[]) {
      if (auth.exclusion.names.includes(o.영업사원?.trim() ?? "")) continue;
      const k = opinionKey(o.영업사원, o.정산월);
      groups.set(k, [...(groups.get(k) ?? []), o]);
    }
    const counts: Record<string, number> = {};
    for (const [k, rows] of groups) {
      const n = unansweredCount(rows);
      if (n > 0) counts[k] = n;
    }
    return { ok: true, data: counts };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

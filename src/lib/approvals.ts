import "server-only";

// 승인필요입금내역: 입금내역의 등록·수정·삭제는 먼저 이 테이블에 '승인대기' 요청으로 들어가고,
// CEO가 승인하면 입금내역에 실제로 반영된다.
//   요청구분  등록 → 입금내역에 새 행 입력
//            수정 → 입금내역id 행을 요청 내용으로 변경
//            삭제 → 입금내역id 행 삭제 (요청 행에는 삭제 당시 내용을 복사해 둔다)

import {
  DEPOSIT_COLUMNS,
  pickDepositRow,
  toDeposit,
  type Deposit,
  type DepositRecord,
  type DepositRow,
  type Parsed,
} from "@/lib/deposits";
import { AUTH_TABLE, DEPOSITS_TABLE, getSupabaseAdmin, PENDING_DEPOSITS_TABLE } from "@/lib/supabase-admin";

export const STATUS_PENDING = "승인대기";
export const STATUS_APPROVED = "승인";
export const STATUS_REJECTED = "반려";

export const REQUEST_KINDS = ["등록", "수정", "삭제"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

type RequestRecord = DepositRow & {
  id: number;
  요청구분: RequestKind;
  입금내역id: number | null;
  요청자: number | null;
  요청일시: string;
  승인여부: string | null;
};

export type PendingRequest = Parsed<RequestRecord> & {
  요청자이름: string | null;
  /** 요청일시를 한국 시간으로 표시한 문자열 */
  요청일시표시: string;
  /** 수정·삭제 요청의 대상 입금내역 현재 값 (이미 지워졌으면 null) */
  original: Deposit | null;
};

const REQUEST_COLUMNS = ["id", "요청구분", "입금내역id", "요청자", "요청일시", "승인여부", ...DEPOSIT_COLUMNS].join(", ");

/** 요청일시 컬럼은 time zone 없는 timestamp(UTC 기준)이므로 한국 시간으로 바꿔 표시 */
function formatRequestedAt(value: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
}

export async function insertRequest(
  kind: RequestKind,
  row: DepositRow,
  targetId: number | null,
  requester: number,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(PENDING_DEPOSITS_TABLE)
    .insert({ ...pickDepositRow(row), 요청구분: kind, 입금내역id: targetId, 요청자: requester, 승인여부: STATUS_PENDING });
  if (error) throw new Error(`승인 요청 등록 실패: ${error.message}`);
}

export async function countPendingRequests(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(PENDING_DEPOSITS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("승인여부", STATUS_PENDING);
  if (error) throw new Error(`승인 대기 건수 조회 실패: ${error.message}`);
  return count ?? 0;
}

/** 입금내역 id → 대기 중인 요청구분 (수정/삭제 승인 대기 표시용) */
export async function fetchPendingTargets(): Promise<Record<number, RequestKind>> {
  const { data, error } = await getSupabaseAdmin()
    .from(PENDING_DEPOSITS_TABLE)
    .select("입금내역id, 요청구분")
    .eq("승인여부", STATUS_PENDING)
    .not("입금내역id", "is", null);
  if (error) throw new Error(`승인 대기 요청 조회 실패: ${error.message}`);
  const out: Record<number, RequestKind> = {};
  for (const r of (data ?? []) as unknown as { 입금내역id: number; 요청구분: RequestKind }[]) out[r.입금내역id] = r.요청구분;
  return out;
}

export async function hasPendingRequestFor(depositId: number): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from(PENDING_DEPOSITS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("승인여부", STATUS_PENDING)
    .eq("입금내역id", depositId);
  if (error) throw new Error(`승인 대기 요청 조회 실패: ${error.message}`);
  return (count ?? 0) > 0;
}

/** 승인 대기 요청 목록 (먼저 요청한 순) + 요청자 이름, 수정·삭제 대상의 현재 값 */
export async function fetchPendingRequests(): Promise<PendingRequest[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(PENDING_DEPOSITS_TABLE)
    .select(REQUEST_COLUMNS)
    .eq("승인여부", STATUS_PENDING)
    .order("요청일시")
    .order("id")
    .limit(1000);
  if (error) throw new Error(`승인 대기 목록 조회 실패: ${error.message}`);
  const requests = (data ?? []) as unknown as RequestRecord[];

  const requesterIds = [...new Set(requests.map((r) => r.요청자).filter((v): v is number => v != null))];
  const targetIds = [...new Set(requests.map((r) => r.입금내역id).filter((v): v is number => v != null))];
  const [users, targets] = await Promise.all([
    requesterIds.length
      ? sb.from(AUTH_TABLE).select("id, 이름").in("id", requesterIds)
      : Promise.resolve({ data: [], error: null }),
    targetIds.length
      ? sb.from(DEPOSITS_TABLE).select("*").in("id", targetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (users.error) throw new Error(`요청자 조회 실패: ${users.error.message}`);
  if (targets.error) throw new Error(`대상 입금내역 조회 실패: ${targets.error.message}`);
  const names = new Map((users.data as unknown as { id: number; 이름: string | null }[]).map((u) => [u.id, u.이름]));
  const originals = new Map((targets.data as DepositRecord[]).map((d) => [d.id, toDeposit(d)]));

  return requests.map((r) => ({
    ...toDeposit(r),
    요청자이름: r.요청자 != null ? (names.get(r.요청자) ?? null) : null,
    요청일시표시: formatRequestedAt(r.요청일시),
    original: r.입금내역id != null ? (originals.get(r.입금내역id) ?? null) : null,
  }));
}

/** '승인대기'인 요청만 상태를 바꾼다. 바뀐 요청을 돌려준다 (이미 처리됐으면 null). */
async function claimRequest(id: number, status: string): Promise<RequestRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PENDING_DEPOSITS_TABLE)
    .update({ 승인여부: status })
    .eq("id", id)
    .eq("승인여부", STATUS_PENDING)
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`승인 처리 실패: ${error.message}`);
  return data as unknown as RequestRecord | null;
}

async function unclaim(id: number) {
  await getSupabaseAdmin().from(PENDING_DEPOSITS_TABLE).update({ 승인여부: STATUS_PENDING }).eq("id", id);
}

export type ApproveResult = {
  request: RequestRecord;
  /** 수정·삭제 전 입금내역 값 (현장 합계 재계산용) */
  before: DepositRow | null;
};

/**
 * 승인: 요청을 '승인'으로 바꾸고 입금내역에 반영한다.
 * '승인대기'인 요청만 처리하므로 두 번 눌러도 한 번만 반영된다. 반영에 실패하면 '승인대기'로 되돌린다.
 */
export async function approveRequest(id: number): Promise<ApproveResult | null> {
  const request = await claimRequest(id, STATUS_APPROVED);
  if (!request) return null;
  const sb = getSupabaseAdmin();
  const content = pickDepositRow(request);
  try {
    if (request.요청구분 === "등록") {
      const { error } = await sb.from(DEPOSITS_TABLE).insert(content);
      if (error) throw new Error(`입금내역 입력 실패: ${error.message}`);
      return { request, before: null };
    }

    if (request.입금내역id == null) throw new Error("수정·삭제할 입금내역 정보가 없는 요청입니다. 반려해 주세요.");
    const { data: before, error: readError } = await sb
      .from(DEPOSITS_TABLE)
      .select("*")
      .eq("id", request.입금내역id)
      .maybeSingle();
    if (readError) throw new Error(`대상 입금내역 조회 실패: ${readError.message}`);
    if (!before) throw new Error("대상 입금내역이 이미 삭제되었습니다. 이 요청은 반려해 주세요.");

    const { error } =
      request.요청구분 === "수정"
        ? await sb.from(DEPOSITS_TABLE).update(content).eq("id", request.입금내역id)
        : await sb.from(DEPOSITS_TABLE).delete().eq("id", request.입금내역id);
    if (error) throw new Error(`입금내역 ${request.요청구분} 실패: ${error.message}`);
    return { request, before: pickDepositRow(before as DepositRecord) };
  } catch (e) {
    await unclaim(id);
    throw e;
  }
}

/** 반려: 요청을 '반려'로 바꾼다 (입금내역은 그대로) */
export async function rejectRequest(id: number): Promise<boolean> {
  return (await claimRequest(id, STATUS_REJECTED)) !== null;
}

// 로그인한 사용자가 볼 수 있는 데이터 범위.
// 역할이 RD(영업사원)이면 현장정보·입금내역의 '영업사원' 컬럼이 본인 이름과 같은 행만 다룬다.

import type { SessionPayload } from "@/lib/session-token";

export const RESTRICTED_ROLE = "RD";

/** salesName이 null이면 전체, 문자열이면 해당 영업사원 행만 */
export type DataScope = { salesName: string | null };

export function scopeFor(session: SessionPayload): DataScope {
  return session.role.trim() === RESTRICTED_ROLE ? { salesName: session.name } : { salesName: null };
}

/** Supabase 쿼리에 영업사원 조건을 붙인다 (전체 범위면 그대로) */
export function applyScope<Q>(query: Q, scope: DataScope): Q {
  if (scope.salesName == null) return query;
  // Supabase 필터 빌더의 eq()는 같은 빌더를 돌려준다. (제네릭 제약으로 쓰면 타입 계산이 너무 깊어져 캐스팅)
  return (query as unknown as { eq(column: string, value: string): Q }).eq("영업사원", scope.salesName);
}

/** 저장할 데이터의 영업사원을 범위에 맞게 고정한다 (RD는 본인 이름으로) */
export function withScopedSalesName<T extends { 영업사원?: string | null }>(data: T, scope: DataScope): T {
  return scope.salesName == null ? data : { ...data, 영업사원: scope.salesName };
}

/** 입금 등록 승인 권한이 있는 역할 */
export const APPROVER_ROLE = "CEO";

export function canApprove(session: Pick<SessionPayload, "role"> | null): boolean {
  return !!session && session.role.trim() === APPROVER_ROLE;
}

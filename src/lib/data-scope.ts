// 로그인한 사용자가 볼 수 있는 데이터 범위.
// 역할이 RD(영업사원)이면 현장정보·입금내역의 '영업사원' 컬럼이 본인 이름과 같은 행만 다룬다.

import type { SessionPayload } from "@/lib/session-token";

export const RESTRICTED_ROLE = "RD";

/** 해당 현장의 RD와 슈퍼관리자에게만 보이는 현장번호 */
export const PRIVATE_SITE_NUMBERS: readonly string[] = ["1111"];

/**
 * salesName이 null이면 전체, 문자열이면 해당 영업사원 행만.
 * hidePrivateSites가 true면 비공개 현장의 행을 뺀다.
 */
export type DataScope = { salesName: string | null; hidePrivateSites: boolean };

export function scopeFor(session: SessionPayload): DataScope {
  const isRd = session.role.trim() === RESTRICTED_ROLE;
  return {
    salesName: isRd ? session.name : null,
    // RD는 salesName 조건으로 본인 현장만 보이므로 비공개 현장도 해당 현장의 RD에게만 보인다
    hidePrivateSites: !isRd && !isSuperAdmin(session),
  };
}

/** 비공개 현장의 행을 뺀다. 현장번호 컬럼이 있는 테이블에 쓴다 (현장번호가 비어 있는 행은 남긴다) */
export function applySiteVisibility<Q>(query: Q, scope: Pick<DataScope, "hidePrivateSites">): Q {
  if (!scope.hidePrivateSites) return query;
  const numbers = PRIVATE_SITE_NUMBERS.map((n) => `"${n}"`).join(",");
  return (query as unknown as { or(filters: string): Q }).or(`현장번호.is.null,현장번호.not.in.(${numbers})`);
}

/** Supabase 쿼리에 데이터 범위 조건을 붙인다 */
export function applyScope<Q>(query: Q, scope: DataScope): Q {
  const visible = applySiteVisibility(query, scope);
  if (scope.salesName == null) return visible;
  // Supabase 필터 빌더의 eq()는 같은 빌더를 돌려준다. (제네릭 제약으로 쓰면 타입 계산이 너무 깊어져 캐스팅)
  return (visible as unknown as { eq(column: string, value: string): Q }).eq("영업사원", scope.salesName);
}

/** 저장할 데이터의 영업사원을 범위에 맞게 고정한다 (RD는 본인 이름으로) */
export function withScopedSalesName<T extends { 영업사원?: string | null }>(data: T, scope: DataScope): T {
  return scope.salesName == null ? data : { ...data, 영업사원: scope.salesName };
}

/** 대시보드 등 최상위 메뉴를 볼 수 있는 역할 (권한.역할 값). 관리자 권한(승인)도 함께 가진다 */
export const SUPER_ADMIN_ROLE = "슈퍼관리자";

/** 입금 등록·수정·삭제 승인 권한이 있는 역할 (권한.역할 값) */
export const APPROVER_ROLES: readonly string[] = ["CEO", "관리자", SUPER_ADMIN_ROLE];

export function canApprove(session: Pick<SessionPayload, "role"> | null): boolean {
  return !!session && APPROVER_ROLES.includes(session.role.trim());
}

export function isSuperAdmin(session: Pick<SessionPayload, "role"> | null): boolean {
  return !!session && session.role.trim() === SUPER_ADMIN_ROLE;
}

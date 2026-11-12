import "server-only";

import { cache } from "react";

import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

// 열외 사용자: 권한.비고가 '열외'인 계정 (실제 RD가 아닌 계정 — 관리·테스트용).
// 열외가 아닌 사용자가 로그인하면 모든 화면에서 열외 사용자와 그 데이터를 보여주지 않는다.
// (열외 사용자 본인이 로그인하면 전부 보인다)

export const EXCLUDED_MARK = "열외";

export type Exclusion = {
  /** 열외 계정의 권한.id (일정·상담 등록자 등) */
  ids: number[];
  /** 열외 계정의 이름 (현장정보·입금내역 등의 '영업사원' 값). 같은 이름의 일반 계정이 있으면 빼지 않는다 */
  names: string[];
};

const NONE: Exclusion = { ids: [], names: [] };

/** 열외 계정 목록 (요청마다 한 번만 읽는다) */
const fetchExcludedAccounts = cache(async (): Promise<Exclusion> => {
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select("id, 이름, 영업사원ID, 비고");
  if (error) {
    // 비고 컬럼이 없거나 조회에 실패하면 아무도 빼지 않는다 (화면은 계속 동작)
    console.error("[excluded-users] 권한 조회 실패:", error.message);
    return NONE;
  }
  const rows = (data ?? []) as unknown as { id: number; 이름: string | null; 영업사원ID: string; 비고: string | null }[];
  const nameOf = (r: (typeof rows)[number]) => r.이름?.trim() || r.영업사원ID;
  const excluded = rows.filter((r) => r.비고?.trim() === EXCLUDED_MARK);
  const regularNames = new Set(rows.filter((r) => r.비고?.trim() !== EXCLUDED_MARK).map(nameOf));
  return {
    ids: excluded.map((r) => r.id),
    names: [...new Set(excluded.map(nameOf))].filter((n) => !regularNames.has(n)),
  };
});

/** 로그인한 사용자(uid)에게 숨길 열외 계정. 본인이 열외면 아무도 숨기지 않는다 */
export const exclusionFor = cache(async (uid: number): Promise<Exclusion> => {
  const all = await fetchExcludedAccounts();
  return all.ids.includes(uid) ? NONE : all;
});

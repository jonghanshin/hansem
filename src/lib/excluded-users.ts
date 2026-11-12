import "server-only";

import { cache } from "react";

import { fetchAuthDirectory } from "@/lib/auth-directory";

// 열외 사용자: 권한.비고가 '열외'인 계정 (실제 RD가 아닌 계정 — 관리·테스트용).
// 열외가 아닌 사용자가 로그인하면 모든 화면에서 열외 사용자와 그 데이터를 보여주지 않는다.
// (열외 사용자 본인이 로그인하면 전부 보인다)
// 권한 목록은 auth-directory에서 1분 동안 캐시한다. 조회에 실패하면 그대로 던진다
// (실패했다고 숨김을 풀면 열외 계정의 데이터가 보이게 되므로).

export const EXCLUDED_MARK = "열외";

export type Exclusion = {
  /** 열외 계정의 권한.id (일정·상담 등록자 등) */
  ids: number[];
  /** 열외 계정의 이름 (현장정보·입금내역 등의 '영업사원' 값). 같은 이름의 일반 계정이 있으면 빼지 않는다 */
  names: string[];
};

const NONE: Exclusion = { ids: [], names: [] };

/** 열외 계정 목록 (요청마다 한 번만 계산한다) */
const fetchExcludedAccounts = cache(async (): Promise<Exclusion> => {
  const rows = await fetchAuthDirectory();
  const excluded = rows.filter((r) => r.비고 === EXCLUDED_MARK);
  const regularNames = new Set(rows.filter((r) => r.비고 !== EXCLUDED_MARK).map((r) => r.이름));
  return {
    ids: excluded.map((r) => r.id),
    names: [...new Set(excluded.map((r) => r.이름))].filter((n) => !regularNames.has(n)),
  };
});

/** 로그인한 사용자(uid)에게 숨길 열외 계정. 본인이 열외면 아무도 숨기지 않는다 */
export const exclusionFor = cache(async (uid: number): Promise<Exclusion> => {
  const all = await fetchExcludedAccounts();
  return all.ids.includes(uid) ? NONE : all;
});

import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

// 권한 테이블의 사용자 목록 (이름·역할·비고만. 비밀번호·전화번호는 넣지 않는다).
// 열외 판단, 팀원·담당자 목록, 캘린더 자동 등록 등 여러 화면이 페이지마다 읽어서 1분 동안 캐시한다.
// 권한 테이블을 DB에서 직접 고치면 최대 1분 정도 뒤에 반영된다.
// (로그인·비밀번호 변경은 이 캐시를 쓰지 않고 항상 테이블을 직접 읽는다)

export const AUTH_DIRECTORY_TAG = "auth-directory";

export type DirectoryUser = {
  id: number;
  영업사원ID: string;
  /** 이름이 비어 있으면 영업사원ID */
  이름: string;
  역할: string;
  비고: string;
};

type Row = { id: number; 영업사원ID: string; 이름: string | null; 역할: string | null; 비고?: string | null };

export async function fetchAuthDirectory(): Promise<DirectoryUser[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(AUTH_DIRECTORY_TAG);

  const sb = getSupabaseAdmin();
  let { data, error } = await sb.from(AUTH_TABLE).select("id, 영업사원ID, 이름, 역할, 비고");
  if (error?.code === "42703") {
    // 비고 컬럼이 없으면 비고 없이 (열외 계정 없음으로 처리)
    ({ data, error } = await sb.from(AUTH_TABLE).select("id, 영업사원ID, 이름, 역할"));
  }
  if (error) throw new Error(`권한 조회 실패: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    영업사원ID: r.영업사원ID,
    이름: r.이름?.trim() || r.영업사원ID,
    역할: r.역할?.trim() ?? "",
    비고: r.비고?.trim() ?? "",
  }));
}

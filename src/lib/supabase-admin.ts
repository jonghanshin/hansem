import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SITES_TABLE = "현장정보";
export const DEPOSITS_TABLE = "입금내역";
export const HANSEM_ORDERS_TABLE = "한샘주문진도정보";
export const HANSEM_EXTRA_COST_TABLE = "한샘추가시공비";
export const AUTH_TABLE = "권한";
export const PENDING_DEPOSITS_TABLE = "승인필요입금내역";
export const BOARD_TABLE = "게시판";
export const BOARD_FILES_TABLE = "게시판첨부";
export const CALENDAR_TABLE = "일정";
export const CONSULT_TABLE = "상담";
export const CONSULT_RECORDS_TABLE = "상담기록";
export const AS_TABLE = "AS접수";
export const AS_HISTORY_TABLE = "AS이력";

export class MissingSupabaseConfigError extends Error {
  constructor() {
    super(
      ".env.local에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY를 설정한 뒤 개발 서버를 다시 시작하세요.",
    );
    this.name = "MissingSupabaseConfigError";
  }
}

let client: SupabaseClient | undefined;

/**
 * 서버 전용 Supabase 클라이언트.
 * secret key는 RLS를 우회하므로 절대 브라우저로 보내면 안 된다 ("server-only"로 보호).
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new MissingSupabaseConfigError();
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

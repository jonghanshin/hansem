"use server";

import { redirect } from "next/navigation";

import {
  CONNECTED,
  MIN_PASSWORD_LENGTH,
  endSession,
  getSession,
  startSession,
  verifyPassword,
  type AuthUser,
} from "@/lib/auth";
import { AUTH_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

// 성공하면 redirectTo를 돌려주고, 화면에서 페이지를 완전히 새로 불러온다.
// (이 Next.js는 이전 화면을 숨겨서 보관하므로 soft redirect로는 이전 사용자의 화면 상태가 남을 수 있다)
export type FormState = { error?: string; values?: Record<string, string>; redirectTo?: string };

const USER_COLUMNS = "id, 영업사원ID, 이름, 역할, 비번, 접속여부";
const LOGIN_FAILED = "ID 또는 비밀번호가 올바르지 않습니다.";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

async function findUser(column: "id" | "영업사원ID", value: string | number): Promise<AuthUser | null> {
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select(USER_COLUMNS).eq(column, value).limit(2);
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  // 같은 영업사원ID가 둘 이상이면 누구인지 확정할 수 없으므로 로그인 거부
  return data?.length === 1 ? (data[0] as unknown as AuthUser) : null;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = str(formData, "id").trim();
  const password = str(formData, "password");
  if (!id || !password) return { error: "ID와 비밀번호를 입력하세요.", values: { id } };

  let firstLogin: boolean;
  try {
    const user = await findUser("영업사원ID", id);
    if (!user || !(await verifyPassword(password, user.비번))) return { error: LOGIN_FAILED, values: { id } };

    firstLogin = user.접속여부 == null;
    if (!firstLogin) {
      await getSupabaseAdmin().from(AUTH_TABLE).update({ 접속시간: new Date().toISOString() }).eq("id", user.id);
    }
    await startSession(user, firstLogin);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), values: { id } };
  }
  return { redirectTo: firstLogin ? "/change-password" : "/" };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자리 이상이어야 합니다.` };
  }
  if (password !== confirm) return { error: "비밀번호 확인이 일치하지 않습니다." };

  try {
    const user = await findUser("id", session.uid);
    if (!user) {
      await endSession();
      return { error: "사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요." };
    }
    if (await verifyPassword(password, user.비번)) {
      return { error: "기존 비밀번호와 다른 비밀번호를 입력하세요." };
    }

    const { error } = await getSupabaseAdmin()
      .from(AUTH_TABLE)
      .update({ 비번: password, 접속여부: CONNECTED, 접속시간: new Date().toISOString() })
      .eq("id", user.id);
    if (error) return { error: `비밀번호 변경 실패: ${error.message}` };

    await startSession(user, false);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  return { redirectTo: "/" };
}

/** 세션만 지운다. 이동은 화면에서 전체 새로고침으로 한다 (logout-button.tsx) */
export async function logoutAction(): Promise<void> {
  await endSession();
}

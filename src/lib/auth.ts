import "server-only";

import { scrypt as scryptCb, timingSafeEqual, type BinaryLike } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { canApprove, scopeFor, type DataScope } from "@/lib/data-scope";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/session-token";

export const MIN_PASSWORD_LENGTH = 4;
/** 최초 접속 이후 권한.접속여부에 기록하는 값 */
export const CONNECTED = "접속";

export type AuthUser = {
  id: number;
  영업사원ID: string;
  이름: string | null;
  역할: string | null;
  비번: string | null;
  접속여부: string | null;
};

// ---------- 비밀번호 ----------
// 비밀번호는 권한.비번 컬럼에 입력한 그대로(평문) 저장한다. 관리자가 테이블에서 직접 확인·초기화할 수 있게 하기 위함.
// 이전 버전에서 "scrypt$salt$hash" 형태로 저장된 비밀번호도 계속 로그인할 수 있도록 두 형식을 모두 확인한다.

const scrypt = promisify(scryptCb) as (pw: BinaryLike, salt: BinaryLike, keylen: number) => Promise<Buffer>;
const HASH_PREFIX = "scrypt$";

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (stored == null || stored === "") return false;
  if (stored.startsWith(HASH_PREFIX)) {
    const [saltB64, hashB64] = stored.slice(HASH_PREFIX.length).split("$");
    if (!saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
    return timingSafeEqual(actual, expected);
  }
  // 평문 초기 비밀번호
  const a = Buffer.from(password);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- 세션 ----------

/** 요청이 https로 들어왔는지 (프록시/호스팅 뒤에서는 x-forwarded-proto, 없으면 origin으로 판단) */
async function isHttpsRequest(): Promise<boolean> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  return h.get("origin")?.startsWith("https://") ?? false;
}

export async function getSession(): Promise<SessionPayload | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function startSession(user: AuthUser, mustChangePassword: boolean): Promise<void> {
  const token = await signSession({
    uid: user.id,
    sid: user.영업사원ID,
    name: user.이름 ?? user.영업사원ID,
    role: user.역할 ?? "",
    mustChangePassword,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // https로 접속했을 때만 Secure. (운영 서버를 http로 접속하면 Secure 쿠키는 저장되지 않아 로그인이 풀린다)
    secure: await isHttpsRequest(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** 화면(서버 컴포넌트)용: 로그인·비밀번호 변경이 끝난 사용자만 통과, 아니면 해당 화면으로 이동 */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}

/** 화면(서버 컴포넌트)용: 로그인 확인 후 볼 수 있는 데이터 범위를 돌려준다 */
export async function requireScope(): Promise<DataScope> {
  return scopeFor(await requireUser());
}

/** Server Action용: 통과하지 못하면 오류 메시지, 통과하면 데이터 범위를 돌려준다 */
export async function authorizeAction(): Promise<
  { ok: false; error: string } | { ok: true; uid: number; scope: DataScope; canApprove: boolean }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (session.mustChangePassword) return { ok: false, error: "비밀번호를 먼저 변경해 주세요." };
  return { ok: true, uid: session.uid, scope: scopeFor(session), canApprove: canApprove(session) };
}

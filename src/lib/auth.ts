import "server-only";

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
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
// 변경한 비밀번호는 "scrypt$salt$hash" 형태로 저장한다.
// 관리자가 넣어 둔 초기 비밀번호(평문)도 로그인할 수 있도록 두 형식을 모두 확인한다.

const scrypt = promisify(scryptCb) as (pw: BinaryLike, salt: BinaryLike, keylen: number) => Promise<Buffer>;
const HASH_PREFIX = "scrypt$";
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `${HASH_PREFIX}${salt.toString("base64")}$${hash.toString("base64")}`;
}

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
    secure: process.env.NODE_ENV === "production",
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

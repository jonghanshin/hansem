// 로그인 세션 토큰 (HMAC-SHA256 서명). proxy와 서버 코드에서 함께 쓰므로 Web Crypto만 사용한다.

export const SESSION_COOKIE = "hansem_session";
export const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12시간

export type SessionPayload = {
  /** 권한.id */
  uid: number;
  /** 권한.영업사원ID */
  sid: string;
  name: string;
  role: string;
  /** true면 최초 접속: 비밀번호를 바꾸기 전까지 다른 화면 사용 불가 */
  mustChangePassword: boolean;
  /** 만료 시각 (epoch ms) */
  exp: number;
};

export class MissingAuthSecretError extends Error {
  constructor() {
    super(".env.local에 AUTH_SECRET(32자 이상)을 설정한 뒤 개발 서버를 다시 시작하세요.");
    this.name = "MissingAuthSecretError";
  }
}

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | undefined;

function getKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new MissingAuthSecretError();
  keyPromise ??= crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
  return keyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSession(payload: Omit<SessionPayload, "exp">): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Date.now() + SESSION_MAX_AGE_SEC * 1000 };
  const body = toBase64Url(encoder.encode(JSON.stringify(full)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

/** 서명·만료가 유효하면 payload, 아니면 null */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await getKey(), fromBase64Url(sig), encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    if (e instanceof MissingAuthSecretError) throw e;
    return null;
  }
}

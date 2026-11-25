import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

/**
 * Server Action ID 길이. Next.js가 만드는 ID는 항상 42자이고, Next.js도 길이가 다르면 바로 거절한다
 * (node_modules/next/dist/shared/lib/server-reference-info.js의 SERVER_REFERENCE_ID_LENGTH).
 * Next.js를 올린 뒤 이 값이 바뀌면 같이 고쳐야 한다.
 */
const SERVER_ACTION_ID_LENGTH = 42;

// 화면 이동 전 빠른 확인(쿠키 서명·만료만 검사). 실제 권한 확인은 각 화면과 Server Action에서 다시 한다.
export async function proxy(request: NextRequest) {
  // 스캐너·봇이 보내는 가짜 Server Action 요청(Next-Action: "1", "action" 등)은 Next.js까지 보내지 않고
  // 바로 400으로 돌려보낸다. Next.js도 어차피 거절하지만 그때마다 서버 로그에 오류가 쌓인다.
  const actionId = request.headers.get("next-action");
  if (actionId !== null && actionId.length !== SERVER_ACTION_ID_LENGTH) {
    return new NextResponse(null, { status: 400 });
  }

  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (pathname === "/login") {
    if (session) return go(session.mustChangePassword ? "/change-password" : "/");
    return NextResponse.next();
  }
  if (!session) return go("/login");
  if (session.mustChangePassword && pathname !== "/change-password") return go("/change-password");
  if (!session.mustChangePassword && pathname === "/change-password") return go("/");
  return NextResponse.next();
}

export const config = {
  // 정적 파일·이미지는 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

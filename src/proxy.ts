import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// 화면 이동 전 빠른 확인(쿠키 서명·만료만 검사). 실제 권한 확인은 각 화면과 Server Action에서 다시 한다.
export async function proxy(request: NextRequest) {
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

import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { noticeHref, readNotice } from "@/lib/notices";

// 알림을 누르면: 읽음 처리 후 해당 상담·A/S 화면으로 이동한다 (본인 알림만)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const session = await getSession();
  if (!session || session.mustChangePassword) return go("/login");

  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return go("/notices");
  const notice = await readNotice(session.uid, id).catch((e: unknown) => {
    console.error("[알림]", e);
    return null;
  });
  return go(notice ? noticeHref(notice.kind, notice.targetId) : "/notices");
}

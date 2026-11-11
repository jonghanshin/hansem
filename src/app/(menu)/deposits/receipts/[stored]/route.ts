import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { applyScope, applySiteVisibility, canApprove, scopeFor } from "@/lib/data-scope";
import { readReceipt } from "@/lib/receipt-files";
import { isReceiptStoredName, parseReceipt } from "@/lib/receipt-files-shared";
import { DEPOSITS_TABLE, getSupabaseAdmin, PENDING_DEPOSITS_TABLE } from "@/lib/supabase-admin";

// 입금 영수증 내려받기. 그 영수증이 붙은 입금내역을 볼 수 있거나, 승인 요청을 처리·요청한 사람만 받을 수 있다.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ stored: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });

  const { stored } = await ctx.params;
  if (!isReceiptStoredName(stored)) return new Response("잘못된 요청입니다", { status: 400 });

  const scope = scopeFor(session);
  const sb = getSupabaseAdmin();
  const pattern = `%${stored}%`; // 저장 이름은 임의 문자열이라 다른 값과 겹치지 않는다

  // 1) 볼 수 있는 입금내역에 붙은 영수증
  const deposits = await applyScope(sb.from(DEPOSITS_TABLE).select("영수증").like("영수증", pattern), scope).limit(1);
  let value = (deposits.data as { 영수증: string | null }[] | null)?.[0]?.영수증 ?? null;

  // 2) 승인 요청에 붙은 영수증: 승인 권한자(비공개 현장 제외) 또는 요청한 본인
  if (!value) {
    const requests = await applySiteVisibility(
      sb.from(PENDING_DEPOSITS_TABLE).select("영수증, 요청자").like("영수증", pattern),
      canApprove(session) ? scope : { hidePrivateSites: false },
    ).limit(5);
    const rows = (requests.data as { 영수증: string | null; 요청자: number | null }[] | null) ?? [];
    value = rows.find((r) => canApprove(session) || r.요청자 === session.uid)?.영수증 ?? null;
  }

  const info = parseReceipt(value);
  if (!info || info.stored !== stored) return new Response("파일을 찾을 수 없습니다", { status: 404 });
  const file = await readReceipt(stored).catch((e: unknown) => {
    console.error("[receipt] 파일 읽기 실패:", e);
    return null;
  });
  if (!file) return new Response("파일을 찾을 수 없습니다", { status: 404 });

  // 한글 파일명은 RFC 5987 형식(filename*)으로, 구형 브라우저용 filename은 ASCII만
  const asciiName = info.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file), {
    headers: {
      // 올린 파일이 이 사이트 안에서 실행되지 않도록 항상 내려받기로 처리
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(info.name)}`,
      "Content-Length": String(file.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

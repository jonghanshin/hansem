import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { fetchConsult } from "@/lib/consult";
import { readConsultFile } from "@/lib/consult-files";
import { CONSULT_STORED_NAME_RE } from "@/lib/consult-shared";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

// 상담노트 첨부파일 내려받기. 그 상담을 볼 수 있는 사용자만 받을 수 있다.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; stored: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  if (!canUseConsult(session)) return new Response("권한이 없습니다", { status: 403 });

  const { id: rawId, stored: rawStored } = await ctx.params;
  const id = Number(rawId);
  const stored = decodeURIComponent(rawStored);
  if (!Number.isSafeInteger(id) || id <= 0 || !CONSULT_STORED_NAME_RE.test(stored)) {
    return new Response("잘못된 요청입니다", { status: 400 });
  }

  const view = { ...(await exclusionFor(session.uid)), salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
  const consult = await fetchConsult(id, view).catch((e: unknown) => {
    console.error("[consult-files] 상담 조회 실패:", e);
    return null;
  });
  const info = consult?.첨부.find((f) => f.stored === stored);
  if (!info) return new Response("파일을 찾을 수 없습니다", { status: 404 });

  const file = await readConsultFile(stored).catch((e: unknown) => {
    console.error("[consult-files] 파일 읽기 실패:", e);
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

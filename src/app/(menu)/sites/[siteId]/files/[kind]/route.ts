import type { NextRequest } from "next/server";

import { getSession, resolveScope } from "@/lib/auth";
import { applyScope } from "@/lib/data-scope";
import { readSiteFile } from "@/lib/site-files";
import { isSiteFileKind, parseSiteFile, siteFileColumn } from "@/lib/site-files-shared";
import { getSupabaseAdmin, SITES_TABLE } from "@/lib/supabase-admin";

// 현장 문서(최종계약서·최종견적서·자재리스트) 내려받기. 로그인하고 그 현장을 볼 수 있는 사용자만 받을 수 있다.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ siteId: string; kind: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });

  const { siteId: rawId, kind } = await ctx.params;
  const siteId = Number(rawId);
  if (!Number.isSafeInteger(siteId) || siteId <= 0 || !isSiteFileKind(kind)) {
    return new Response("잘못된 요청입니다", { status: 400 });
  }

  const column = siteFileColumn(kind);
  const { data, error } = await applyScope(
    getSupabaseAdmin().from(SITES_TABLE).select(column).eq("id", siteId),
    (await resolveScope(session)),
  ).maybeSingle();
  if (error) {
    console.error("[site-files] 현장정보 조회 실패:", error.message);
    return new Response("파일 정보를 읽지 못했습니다", { status: 500 });
  }
  const info = parseSiteFile((data as Record<string, unknown> | null)?.[column]);
  if (!info) return new Response("파일을 찾을 수 없습니다", { status: 404 });

  const file = await readSiteFile(kind, info).catch((e: unknown) => {
    console.error("[site-files] 파일 읽기 실패:", e);
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

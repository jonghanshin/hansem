import type { NextRequest } from "next/server";

import { fetchAsCase } from "@/lib/as";
import { readAsFile } from "@/lib/as-files";
import { AS_STORED_NAME_RE } from "@/lib/as-shared";
import { getSession } from "@/lib/auth";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

// A/S 사진·증빙 내려받기. 그 A/S를 볼 수 있는 사용자만 받을 수 있다.
// ?inline=1 이면 사진(jpg·png·gif·webp)만 화면에 바로 보여주고, 그 밖의 파일은 항상 내려받기로 처리한다.

const INLINE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; stored: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  if (!canUseConsult(session)) return new Response("권한이 없습니다", { status: 403 });

  const { id: rawId, stored: rawStored } = await ctx.params;
  const id = Number(rawId);
  const stored = decodeURIComponent(rawStored);
  if (!Number.isSafeInteger(id) || id <= 0 || !AS_STORED_NAME_RE.test(stored)) return new Response("잘못된 요청입니다", { status: 400 });

  const view = { ...(await exclusionFor(session.uid)), salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
  const c = await fetchAsCase(id, view).catch((e: unknown) => {
    console.error("[as-files] A/S 조회 실패:", e);
    return null;
  });
  const info = c?.사진.find((p) => p.stored === stored);
  if (!info) return new Response("파일을 찾을 수 없습니다", { status: 404 });

  const file = await readAsFile(stored).catch((e: unknown) => {
    console.error("[as-files] 파일 읽기 실패:", e);
    return null;
  });
  if (!file) return new Response("파일을 찾을 수 없습니다", { status: 404 });

  const ext = (stored.match(/\.[a-z0-9]+$/)?.[0] ?? "").toLowerCase();
  const inlineType = req.nextUrl.searchParams.get("inline") === "1" ? INLINE_TYPES[ext] : undefined;
  const asciiName = info.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = `${inlineType ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(info.name)}`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": inlineType ?? "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Length": String(file.length),
      "X-Content-Type-Options": "nosniff",
      // 사진을 화면에 보여줄 때도 스크립트가 실행되지 않게
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}

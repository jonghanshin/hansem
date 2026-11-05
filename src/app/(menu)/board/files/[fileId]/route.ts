import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { readAttachment } from "@/lib/board";
import { viewableType } from "@/lib/board-shared";

// 게시판 첨부파일 내려받기. upload 폴더는 공개 폴더가 아니므로 로그인 확인 후 이 경로로만 받을 수 있다.
export async function GET(req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });

  const id = Number((await ctx.params).fileId);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("잘못된 요청입니다", { status: 400 });

  const file = await readAttachment(id).catch((e: unknown) => {
    console.error("[board] 첨부파일 읽기 실패:", e);
    return null;
  });
  if (!file) return new Response("파일을 찾을 수 없습니다", { status: 404 });

  // ?view=1 이고 이미지·PDF면 새 탭에서 바로 보기, 그 외는 항상 내려받기
  const viewType = req.nextUrl.searchParams.get("view") === "1" ? viewableType(file.info.name) : null;

  // 한글 파일명은 RFC 5987 형식(filename*)으로, 구형 브라우저용 filename은 ASCII만
  const asciiName = file.info.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = viewType ? "inline" : "attachment";
  return new Response(new Uint8Array(file.data), {
    headers: {
      // 올린 파일이 이 사이트 안에서 HTML/스크립트로 실행되지 않도록 보기 허용 형식 외에는 내려받기로 처리
      "Content-Type": viewType ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.info.name)}`,
      "Content-Length": String(file.data.length),
      "X-Content-Type-Options": "nosniff",
      // 이미지 바로 보기는 스크립트 실행을 막는 정책을 붙인다 (PDF는 브라우저 PDF 뷰어가 sandbox 정책에서 열리지 않아 제외)
      ...(viewType?.startsWith("image/") && {
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      }),
      "Cache-Control": "private, no-store",
    },
  });
}

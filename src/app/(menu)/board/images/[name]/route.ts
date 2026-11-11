import { getSession } from "@/lib/auth";
import { readBoardImage } from "@/lib/board";
import { BOARD_IMAGE_NAME_RE } from "@/lib/board-shared";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// 게시판 본문 이미지. upload 폴더는 공개 폴더가 아니므로 로그인 확인 후 이 경로로만 볼 수 있다.
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });

  const name = (await ctx.params).name;
  if (!BOARD_IMAGE_NAME_RE.test(name)) return new Response("잘못된 요청입니다", { status: 400 });
  const data = await readBoardImage(name);
  if (!data) return new Response("이미지를 찾을 수 없습니다", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": CONTENT_TYPES[name.slice(name.lastIndexOf(".") + 1)],
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      // 파일명이 매번 새로 만들어지므로 내용이 바뀌지 않는다
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

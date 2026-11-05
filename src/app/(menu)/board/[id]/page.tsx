import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { fetchPost, increaseViews } from "@/lib/board";
import { formatBoardDate, formatFileSize } from "@/lib/board-shared";
import { canApprove } from "@/lib/data-scope";

import { DeletePostButton } from "../delete-post-button";

export const metadata = { title: "게시글 | 게시판" };

type Params = Promise<{ id: string }>;

export default function PostPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">글을 불러오는 중…</p>}>
        <PostView params={params} />
      </Suspense>
    </main>
  );
}

async function PostView({ params }: { params: Params }) {
  await connection();
  const session = await requireUser();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return <Missing />;

  const result = await fetchPost(id).then(
    (post) => ({ ok: true as const, post }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">글을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  const post = result.post;
  if (!post) return <Missing />;

  // 본인 글을 볼 때는 조회수를 올리지 않는다
  const counted = post.authorId !== session.uid;
  if (counted) await increaseViews(post.id);
  const canEdit = post.authorId === session.uid || canApprove(session);

  return (
    <article className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/board" className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
        ← 목록
      </Link>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <header className="border-b border-zinc-100 px-4 py-4 sm:px-6">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold break-all text-zinc-900">
            {post.notice && (
              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">공지</span>
            )}
            {post.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
            <span className="font-medium text-zinc-700">{post.authorName ?? "-"}</span>
            <span>{formatBoardDate(post.createdAt, true)}</span>
            {post.updatedAt && <span>수정 {formatBoardDate(post.updatedAt, true)}</span>}
            <span>조회 {(post.views + (counted ? 1 : 0)).toLocaleString()}</span>
          </p>
        </header>

        {/* 내용은 텍스트 그대로 표시 (HTML로 해석하지 않음) */}
        <div className="min-h-40 px-4 py-5 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-900 sm:px-6">
          {post.content}
        </div>

        {post.files.length > 0 && (
          <div className="border-t border-zinc-100 px-4 py-3 sm:px-6">
            <p className="mb-1.5 text-xs font-semibold text-zinc-500">첨부파일 {post.files.length}개</p>
            <ul className="space-y-1">
              {post.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/board/files/${f.id}`}
                    download={f.name}
                    className="inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50 hover:underline"
                  >
                    <span aria-hidden>📎</span>
                    <span className="min-w-0 truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-zinc-400">{formatFileSize(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {canEdit && (
          <>
            <DeletePostButton id={post.id} />
            <Link
              href={`/board/${post.id}/edit`}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              수정
            </Link>
          </>
        )}
        <Link href="/board" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
          목록
        </Link>
      </div>
    </article>
  );
}

function Missing() {
  return (
    <div className="px-6 py-16 text-center text-sm text-zinc-500">
      <p>글을 찾을 수 없습니다. 삭제되었을 수 있습니다.</p>
      <Link href="/board" className="mt-3 inline-block font-medium text-blue-600 hover:underline">
        목록으로 →
      </Link>
    </div>
  );
}

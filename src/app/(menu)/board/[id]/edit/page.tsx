import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { fetchPost } from "@/lib/board";
import { canApprove } from "@/lib/data-scope";

import { BoardForm } from "../../board-form";

export const metadata = { title: "글 수정 | 게시판" };

type Params = Promise<{ id: string }>;

export default function EditPostPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">글을 불러오는 중…</p>}>
        <EditPost params={params} />
      </Suspense>
    </main>
  );
}

async function EditPost({ params }: { params: Params }) {
  await connection();
  const session = await requireUser();
  const id = Number((await params).id);
  const post = Number.isSafeInteger(id) && id > 0 ? await fetchPost(id) : null;
  if (!post) {
    return (
      <div className="px-6 py-16 text-center text-sm text-zinc-500">
        <p>글을 찾을 수 없습니다.</p>
        <Link href="/board" className="mt-3 inline-block font-medium text-blue-600 hover:underline">
          목록으로 →
        </Link>
      </div>
    );
  }
  const admin = canApprove(session);
  if (post.authorId !== session.uid && !admin) {
    return (
      <div className="px-6 py-16 text-center text-sm text-zinc-500">
        <p>본인이 쓴 글만 수정할 수 있습니다.</p>
        <Link href={`/board/${post.id}`} className="mt-3 inline-block font-medium text-blue-600 hover:underline">
          글로 돌아가기 →
        </Link>
      </div>
    );
  }
  return <BoardForm post={post} canNotice={admin} />;
}

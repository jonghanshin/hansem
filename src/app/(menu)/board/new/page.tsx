import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { canApprove } from "@/lib/data-scope";

import { BoardForm } from "../board-form";

export const metadata = { title: "글쓰기 | 게시판" };

export default function NewPostPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
        <NewPost />
      </Suspense>
    </main>
  );
}

async function NewPost() {
  const session = await requireUser();
  return <BoardForm post={null} canNotice={canApprove(session)} />;
}

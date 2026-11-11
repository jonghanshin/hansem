import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { isBoardCategory } from "@/lib/board-shared";
import { canApprove } from "@/lib/data-scope";

import { BoardForm } from "../board-form";

export const metadata = { title: "글쓰기 | 게시판" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function NewPostPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
        <NewPost searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewPost({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  // 카테고리 화면에서 글쓰기를 누르면 ?cat=견적 처럼 넘어온다
  const cat = (await searchParams).cat;
  const category = Array.isArray(cat) ? cat[0] : cat;
  return (
    <BoardForm post={null} canNotice={canApprove(session)} defaultCategory={isBoardCategory(category) ? category : null} />
  );
}

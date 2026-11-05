"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deletePostAction } from "@/app/board-actions";

export function DeletePostButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm("이 글을 삭제하시겠습니까?\n첨부파일도 함께 삭제되며 되돌릴 수 없습니다.")) return;
    startTransition(async () => {
      const res = await deletePostAction(id);
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      router.push("/board");
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? "삭제 중…" : "삭제"}
    </button>
  );
}

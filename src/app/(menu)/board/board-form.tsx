"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { createPostAction, updatePostAction } from "@/app/board-actions";
import {
  BOARD_CONTENT_MAX,
  BOARD_FILE_MAX_BYTES,
  BOARD_FILES_PER_POST,
  BOARD_TITLE_MAX,
  BOARD_UPLOAD_TOTAL_MAX_BYTES,
  formatFileSize,
  validateUploadFiles,
  type BoardPost,
} from "@/lib/board-shared";

/** 글쓰기(post가 null) / 수정 화면 */
export function BoardForm({ post, canNotice }: { post: BoardPost | null; canNotice: boolean }) {
  const idp = useId();
  const router = useRouter();
  const isEdit = post !== null;
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [notice, setNotice] = useState(post?.notice ?? false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const keptCount = (post?.files.length ?? 0) - removeIds.length;
  const dirty =
    title !== (post?.title ?? "") ||
    content !== (post?.content ?? "") ||
    notice !== (post?.notice ?? false) ||
    newFiles.length > 0 ||
    removeIds.length > 0;

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const merged = [...newFiles];
    for (const f of Array.from(list)) {
      // 같은 파일을 두 번 고르면 한 번만
      if (!merged.some((m) => m.name === f.name && m.size === f.size && m.lastModified === f.lastModified)) merged.push(f);
    }
    const errors = validateUploadFiles(merged, keptCount);
    setError(errors.length ? errors.join("\n") : null);
    if (!errors.length) setNewFiles(merged);
    if (fileInput.current) fileInput.current.value = ""; // 같은 파일을 지운 뒤 다시 고를 수 있게
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("제목을 입력하세요");
    if (!content.trim()) return setError("내용을 입력하세요");
    const errors = validateUploadFiles(newFiles, keptCount);
    if (errors.length) return setError(errors.join("\n"));
    setError(null);

    const form = new FormData();
    form.set("title", title);
    form.set("content", content);
    if (notice) form.set("notice", "on");
    for (const f of newFiles) form.append("files", f);
    for (const id of removeIds) form.append("removeFileIds", String(id));

    startTransition(async () => {
      const res = isEdit ? await updatePostAction(post.id, form) : await createPostAction(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/board/${res.data.id}`);
    });
  }

  function cancel() {
    if (dirty && !window.confirm("작성 중인 내용이 저장되지 않습니다. 나가시겠습니까?")) return;
    router.push(isEdit ? `/board/${post.id}` : "/board");
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6" aria-labelledby={`${idp}-title`}>
      <div className="flex items-center gap-3">
        <Link href="/board" className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline">
          ← 목록
        </Link>
        <h1 id={`${idp}-title`} className="text-lg font-semibold text-zinc-900">
          {isEdit ? "글 수정" : "글쓰기"}
        </h1>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block">
          <Label required>제목</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={BOARD_TITLE_MAX}
            required
            autoFocus={!isEdit}
            className={INPUT}
          />
        </label>

        {canNotice && (
          <label className="flex w-fit items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} className="size-4" />
            공지로 등록 <span className="text-xs text-zinc-500">(목록 맨 위에 고정)</span>
          </label>
        )}

        <label className="block">
          <Label required>내용</Label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={BOARD_CONTENT_MAX}
            required
            rows={14}
            className={`${INPUT} min-h-60 resize-y leading-relaxed`}
          />
          <span className="mt-1 block text-right text-xs text-zinc-400 tabular-nums">
            {content.length.toLocaleString()} / {BOARD_CONTENT_MAX.toLocaleString()}
          </span>
        </label>

        <div>
          <Label>첨부파일</Label>
          <p className="mb-2 text-xs text-zinc-500">
            파일 하나 {formatFileSize(BOARD_FILE_MAX_BYTES)}, 한 번에 합계 {formatFileSize(BOARD_UPLOAD_TOTAL_MAX_BYTES)},
            글 하나에 최대 {BOARD_FILES_PER_POST}개까지 올릴 수 있습니다. (실행 파일 제외)
          </p>

          {post && post.files.length > 0 && (
            <ul className="mb-2 space-y-1">
              {post.files.map((f) => {
                const removed = removeIds.includes(f.id);
                return (
                  <li key={f.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-1.5 text-sm">
                    <span className={`min-w-0 flex-1 truncate ${removed ? "text-zinc-400 line-through" : "text-zinc-800"}`}>
                      {f.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{formatFileSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoveIds((ids) => (removed ? ids.filter((x) => x !== f.id) : [...ids, f.id]))
                      }
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        removed ? "text-blue-700 hover:bg-blue-50" : "text-red-600 hover:bg-red-50"
                      }`}
                    >
                      {removed ? "되살리기" : "삭제"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {newFiles.length > 0 && (
            <ul className="mb-2 space-y-1">
              {newFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm">
                  <span className="shrink-0 rounded bg-blue-600 px-1 text-[10px] font-bold text-white">새 파일</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-800">{f.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatFileSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setNewFiles((list) => list.filter((_, j) => j !== i))}
                    className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileInput}
            type="file"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-100"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? "저장 중…" : isEdit ? "수정" : "등록"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 block text-xs font-medium text-zinc-700">
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </span>
  );
}

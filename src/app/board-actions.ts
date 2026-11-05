"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import { deleteAttachments, deletePost, fetchPost, insertPost, saveAttachments, updatePost } from "@/lib/board";
import { BOARD_CONTENT_MAX, BOARD_TITLE_MAX, validateUploadFiles } from "@/lib/board-shared";
import type { ActionResult } from "@/lib/sites";

// 게시판 글쓰기·수정·삭제. 로그인한 사람은 누구나 글을 쓸 수 있고,
// 수정·삭제는 작성자 본인 또는 관리자(CEO·관리자)만, 공지 지정은 관리자만 할 수 있다.

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

type ParsedForm = { title: string; content: string; notice: boolean; files: File[]; removeIds: number[] };

function parseForm(form: FormData): ParsedForm | string {
  const title = String(form.get("title") ?? "").trim();
  const content = String(form.get("content") ?? "").replace(/\r\n/g, "\n").trimEnd();
  if (!title) return "제목을 입력하세요";
  if (title.length > BOARD_TITLE_MAX) return `제목은 ${BOARD_TITLE_MAX}자 이내로 입력하세요`;
  if (!content.trim()) return "내용을 입력하세요";
  if (content.length > BOARD_CONTENT_MAX) return `내용은 ${BOARD_CONTENT_MAX.toLocaleString()}자 이내로 입력하세요`;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const removeIds = form
    .getAll("removeFileIds")
    .map((v) => Number(v))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return { title, content, notice: form.get("notice") === "on", files, removeIds };
}

export async function createPostAction(form: FormData): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const parsed = parseForm(form);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  const fileErrors = validateUploadFiles(parsed.files);
  if (fileErrors.length) return { ok: false, error: fileErrors.join("\n") };
  try {
    const id = await insertPost({
      제목: parsed.title,
      내용: parsed.content,
      작성자: auth.uid,
      작성자이름: auth.name,
      공지: auth.canApprove && parsed.notice,
    });
    try {
      await saveAttachments(id, parsed.files);
    } catch (e) {
      await deletePost(id).catch(() => {}); // 첨부 저장에 실패하면 글도 남기지 않는다
      throw e;
    }
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePostAction(id: number, form: FormData): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 글 번호입니다" };
  const parsed = parseForm(form);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  try {
    const post = await fetchPost(id);
    if (!post) return { ok: false, error: "글을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (post.authorId !== auth.uid && !auth.canApprove) return { ok: false, error: "본인이 쓴 글만 수정할 수 있습니다" };
    const remaining = post.files.filter((f) => !parsed.removeIds.includes(f.id)).length;
    const fileErrors = validateUploadFiles(parsed.files, remaining);
    if (fileErrors.length) return { ok: false, error: fileErrors.join("\n") };

    await updatePost(id, {
      제목: parsed.title,
      내용: parsed.content,
      // 관리자가 아니면 공지 여부는 바꿀 수 없다
      공지: auth.canApprove ? parsed.notice : post.notice,
    });
    await deleteAttachments(id, parsed.removeIds);
    await saveAttachments(id, parsed.files);
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePostAction(id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "잘못된 글 번호입니다" };
  try {
    const post = await fetchPost(id);
    if (!post) return { ok: false, error: "글을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)" };
    if (post.authorId !== auth.uid && !auth.canApprove) return { ok: false, error: "본인이 쓴 글만 삭제할 수 있습니다" };
    await deletePost(id);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

import "server-only";

// 게시판: 글은 Supabase '게시판' 테이블, 첨부파일 정보는 '게시판첨부' 테이블에 저장하고
// 실제 파일은 서버의 upload 폴더(프로젝트 루트/upload)에 임의의 이름으로 저장한다.
// upload 폴더는 public 밖에 있어 직접 접근할 수 없고, 로그인 확인 후 /board/files/[id]로만 내려받는다.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { imageNamesIn } from "@/lib/board-html";
import {
  BOARD_IMAGE_NAME_RE,
  BOARD_IMAGE_PATH,
  BOARD_IMAGE_TYPES,
  BOARD_PAGE_SIZE,
  type BoardAttachment,
  type BoardPost,
  type BoardPostSummary,
} from "@/lib/board-shared";
import { BOARD_FILES_TABLE, BOARD_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

export const UPLOAD_DIR = path.join(process.cwd(), "upload");

type PostRecord = {
  id: number;
  제목: string;
  내용: string;
  작성자: number | null;
  작성자이름: string | null;
  공지: boolean;
  서식: boolean | null;
  조회수: number;
  작성일시: string;
  수정일시: string | null;
};

type FileRecord = {
  id: number;
  게시글id: number;
  원본파일명: string;
  저장파일명: string;
  크기: number;
  형식: string | null;
  등록일시: string;
};

const LIST_COLUMNS = "id, 제목, 작성자, 작성자이름, 공지, 조회수, 작성일시";
const FILE_COLUMNS = "id, 게시글id, 원본파일명, 저장파일명, 크기, 형식, 등록일시";

/** 테이블이 아직 없을 때 안내 문구 */
function tableError(label: string, message: string): Error {
  if (/schema cache|does not exist/i.test(message)) {
    return new Error(`${label} 실패: 게시판 테이블(또는 컬럼)이 없습니다. doc/게시판.sql을 Supabase SQL Editor에서 실행해 주세요.`);
  }
  return new Error(`${label} 실패: ${message}`);
}

function toAttachment(f: FileRecord): BoardAttachment {
  return { id: f.id, postId: f.게시글id, name: f.원본파일명, size: f.크기, type: f.형식 };
}

/** PostgREST or/ilike 필터에 넣을 수 있도록 특수문자를 뺀 검색어 */
function cleanQuery(q: string): string {
  return q.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
}

export type BoardSearchField = "all" | "title" | "author";

export async function fetchBoardList(opts: {
  page: number;
  q: string;
  field: BoardSearchField;
}): Promise<{ notices: BoardPostSummary[]; posts: BoardPostSummary[]; total: number }> {
  const sb = getSupabaseAdmin();
  const q = cleanQuery(opts.q);
  const from = (opts.page - 1) * BOARD_PAGE_SIZE;

  let query = sb.from(BOARD_TABLE).select(LIST_COLUMNS, { count: "exact" }).eq("공지", false);
  if (q) {
    if (opts.field === "title") query = query.ilike("제목", `%${q}%`);
    else if (opts.field === "author") query = query.ilike("작성자이름", `%${q}%`);
    else query = query.or(`제목.ilike.%${q}%,내용.ilike.%${q}%`);
  }
  const [list, notices] = await Promise.all([
    query.order("id", { ascending: false }).range(from, from + BOARD_PAGE_SIZE - 1),
    // 공지는 검색과 상관없이 모든 페이지 위에 고정
    sb.from(BOARD_TABLE).select(LIST_COLUMNS).eq("공지", true).order("id", { ascending: false }).limit(20),
  ]);
  if (list.error) throw tableError("게시글 목록 조회", list.error.message);
  if (notices.error) throw tableError("공지 조회", notices.error.message);

  const rows = [...(notices.data ?? []), ...(list.data ?? [])] as unknown as PostRecord[];
  const counts = await fetchFileCounts(rows.map((r) => r.id));
  const toSummary = (r: PostRecord): BoardPostSummary => ({
    id: r.id,
    title: r.제목,
    authorName: r.작성자이름,
    notice: r.공지,
    views: r.조회수,
    createdAt: r.작성일시,
    fileCount: counts.get(r.id) ?? 0,
  });
  return {
    notices: (notices.data as unknown as PostRecord[]).map(toSummary),
    posts: (list.data as unknown as PostRecord[]).map(toSummary),
    total: list.count ?? 0,
  };
}

async function fetchFileCounts(postIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (postIds.length === 0) return counts;
  const { data, error } = await getSupabaseAdmin().from(BOARD_FILES_TABLE).select("게시글id").in("게시글id", postIds);
  if (error) throw tableError("첨부파일 조회", error.message);
  for (const r of (data ?? []) as unknown as { 게시글id: number }[]) counts.set(r.게시글id, (counts.get(r.게시글id) ?? 0) + 1);
  return counts;
}

export async function fetchPost(id: number): Promise<BoardPost | null> {
  const sb = getSupabaseAdmin();
  const [post, files] = await Promise.all([
    sb.from(BOARD_TABLE).select("*").eq("id", id).maybeSingle(),
    sb.from(BOARD_FILES_TABLE).select(FILE_COLUMNS).eq("게시글id", id).order("id"),
  ]);
  if (post.error) throw tableError("게시글 조회", post.error.message);
  if (files.error) throw tableError("첨부파일 조회", files.error.message);
  if (!post.data) return null;
  const r = post.data as PostRecord;
  return {
    id: r.id,
    title: r.제목,
    content: r.내용,
    html: r.서식 === true,
    authorId: r.작성자,
    authorName: r.작성자이름,
    notice: r.공지,
    views: r.조회수,
    createdAt: r.작성일시,
    updatedAt: r.수정일시,
    files: (files.data as unknown as FileRecord[]).map(toAttachment),
  };
}

/** 조회수 +1 (실패해도 글 보기는 계속) */
export async function increaseViews(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("게시판_조회수_증가", { p_id: id });
  if (error) console.error("[board] 조회수 증가 실패:", error.message);
}

export async function insertPost(row: {
  제목: string;
  내용: string;
  작성자: number;
  작성자이름: string;
  공지: boolean;
  서식: boolean;
}): Promise<number> {
  const { data, error } = await getSupabaseAdmin().from(BOARD_TABLE).insert(row).select("id").single();
  if (error) throw tableError("게시글 등록", error.message);
  return (data as { id: number }).id;
}

export async function updatePost(
  id: number,
  row: { 제목: string; 내용: string; 공지: boolean; 서식: boolean },
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(BOARD_TABLE)
    .update({ ...row, 수정일시: new Date().toISOString() })
    .eq("id", id);
  if (error) throw tableError("게시글 수정", error.message);
}

/** 글 삭제: 첨부 행은 FK cascade로 함께 지워지고, 디스크의 첨부파일·본문 이미지도 지운다 */
export async function deletePost(id: number): Promise<void> {
  const sb = getSupabaseAdmin();
  const [{ data: files, error: fileError }, { data: post }] = await Promise.all([
    sb.from(BOARD_FILES_TABLE).select(FILE_COLUMNS).eq("게시글id", id),
    sb.from(BOARD_TABLE).select("내용").eq("id", id).maybeSingle(),
  ]);
  if (fileError) throw tableError("첨부파일 조회", fileError.message);
  const { error } = await sb.from(BOARD_TABLE).delete().eq("id", id);
  if (error) throw tableError("게시글 삭제", error.message);
  await removeStoredFiles((files ?? []) as unknown as FileRecord[]);
  await deleteBoardImages(imageNamesIn((post as { 내용?: string } | null)?.내용 ?? ""));
}

// ---------- 본문 이미지 ----------
// 편집기에서 넣은 이미지는 upload/board-images 에 저장하고 /board/images/[파일명] 으로 보여준다.
// 글 수정으로 본문에서 빠진 이미지, 글 삭제 시 본문의 이미지는 디스크에서 지운다.

const IMAGE_DIR = path.join(UPLOAD_DIR, "board-images");

function imagePath(name: string): string {
  if (!BOARD_IMAGE_NAME_RE.test(name)) throw new Error("잘못된 이미지 이름입니다");
  return path.join(IMAGE_DIR, name);
}

/** 이미지를 저장하고 본문에 넣을 주소를 돌려준다 */
export async function saveBoardImage(file: File): Promise<string> {
  const ext = BOARD_IMAGE_TYPES[file.type];
  if (!ext) throw new Error("PNG, JPG, GIF, WEBP 이미지만 넣을 수 있습니다");
  const name = `${Date.now()}-${randomUUID()}${ext}`;
  await mkdir(IMAGE_DIR, { recursive: true });
  await writeFile(imagePath(name), Buffer.from(await file.arrayBuffer()));
  return `${BOARD_IMAGE_PATH}${name}`;
}

export async function readBoardImage(name: string): Promise<Buffer | null> {
  if (!BOARD_IMAGE_NAME_RE.test(name)) return null;
  return readFile(imagePath(name)).catch(() => null);
}

export async function deleteBoardImages(names: string[]): Promise<void> {
  await Promise.all(
    names
      .filter((n) => BOARD_IMAGE_NAME_RE.test(n))
      .map((n) => rm(imagePath(n), { force: true }).catch((e) => console.error("[board] 이미지 삭제 실패:", n, e))),
  );
}

// ---------- 첨부파일 ----------

/** 저장 파일명은 추측할 수 없는 임의 이름 + 원래 확장자(영숫자만) */
function storedNameFor(original: string): string {
  const ext = path.extname(original).toLowerCase();
  return `${Date.now()}-${randomUUID()}${/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ""}`;
}

/** 경로 조작 방지: upload 폴더 바로 아래 파일만 */
function storedPath(storedName: string): string {
  const base = path.basename(storedName);
  if (base !== storedName || !base) throw new Error("잘못된 파일 이름입니다");
  return path.join(UPLOAD_DIR, base);
}

/** 원본 파일명: 경로 부분과 제어문자를 빼고 길이 제한 */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

export async function saveAttachments(postId: number, files: File[]): Promise<void> {
  if (files.length === 0) return;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const saved: string[] = [];
  try {
    const rows = [];
    for (const file of files) {
      const stored = storedNameFor(file.name);
      await writeFile(storedPath(stored), Buffer.from(await file.arrayBuffer()));
      saved.push(stored);
      rows.push({
        게시글id: postId,
        원본파일명: cleanFileName(file.name),
        저장파일명: stored,
        크기: file.size,
        형식: file.type || null,
      });
    }
    const { error } = await getSupabaseAdmin().from(BOARD_FILES_TABLE).insert(rows);
    if (error) throw tableError("첨부파일 등록", error.message);
  } catch (e) {
    // DB 등록에 실패하면 이미 쓴 파일을 지워 고아 파일이 남지 않게 한다
    await Promise.all(saved.map((s) => rm(storedPath(s), { force: true }).catch(() => {})));
    throw e;
  }
}

/** 지정한 첨부(해당 글의 것만)를 지운다 */
export async function deleteAttachments(postId: number, fileIds: number[]): Promise<void> {
  if (fileIds.length === 0) return;
  const { data, error } = await getSupabaseAdmin()
    .from(BOARD_FILES_TABLE)
    .delete()
    .eq("게시글id", postId)
    .in("id", fileIds)
    .select(FILE_COLUMNS);
  if (error) throw tableError("첨부파일 삭제", error.message);
  await removeStoredFiles((data ?? []) as unknown as FileRecord[]);
}

async function removeStoredFiles(files: FileRecord[]) {
  await Promise.all(
    files.map((f) =>
      rm(storedPath(f.저장파일명), { force: true }).catch((e) => console.error("[board] 파일 삭제 실패:", f.저장파일명, e)),
    ),
  );
}

/** 내려받기용: 첨부 정보 + 파일 내용 */
export async function readAttachment(fileId: number): Promise<{ info: BoardAttachment; data: Buffer } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(BOARD_FILES_TABLE)
    .select(FILE_COLUMNS)
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw tableError("첨부파일 조회", error.message);
  if (!data) return null;
  const f = data as unknown as FileRecord;
  try {
    return { info: toAttachment(f), data: await readFile(storedPath(f.저장파일명)) };
  } catch {
    return null; // 디스크에서 파일이 사라진 경우
  }
}

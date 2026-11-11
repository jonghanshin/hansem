// 게시판: 서버와 화면이 함께 쓰는 타입·제한값

export const BOARD_PAGE_SIZE = 15;
export const BOARD_TITLE_MAX = 200;
export const BOARD_CONTENT_MAX = 20000;
/** 서식 있는 글(HTML)의 최대 길이. 태그·스타일이 포함되므로 텍스트보다 넉넉하게 */
export const BOARD_HTML_MAX = 300_000;
/** 본문에 넣는 이미지 하나 최대 크기 */
export const BOARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** 본문 이미지 주소 앞부분 (로그인 확인 후 내려주는 경로) */
export const BOARD_IMAGE_PATH = "/board/images/";
/** 본문 이미지로 받는 형식 (SVG는 스크립트를 담을 수 있어 제외) */
export const BOARD_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
/** 본문 이미지 저장 파일명 형식: 시각-uuid.확장자 */
export const BOARD_IMAGE_NAME_RE = /^\d+-[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

/** 예전 텍스트 글을 편집기에 넣을 수 있도록 HTML 문단으로 바꾼다 */
export function textToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
/** 파일 하나 최대 크기 */
export const BOARD_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** 한 번에 올리는 파일 합계 최대 크기 (next.config의 bodySizeLimit보다 작아야 함) */
export const BOARD_UPLOAD_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
/** 글 하나에 붙일 수 있는 최대 파일 수 */
export const BOARD_FILES_PER_POST = 10;
/** 실행 파일 등 올리지 않을 확장자 */
export const BOARD_BLOCKED_EXTENSIONS = [".exe", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs", ".js", ".jar", ".scr", ".sh"];

export type BoardAttachment = {
  id: number;
  postId: number;
  name: string;
  size: number;
  type: string | null;
};

export type BoardPostSummary = {
  id: number;
  title: string;
  authorName: string | null;
  notice: boolean;
  views: number;
  createdAt: string;
  fileCount: number;
};

export type BoardPost = {
  id: number;
  title: string;
  content: string;
  /** true면 content가 서식 있는 HTML, false면 예전 방식의 일반 텍스트 */
  html: boolean;
  authorId: number | null;
  authorName: string | null;
  notice: boolean;
  views: number;
  createdAt: string;
  updatedAt: string | null;
  files: BoardAttachment[];
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 파일 이름의 확장자가 막힌 형식인지 */
export function isBlockedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return BOARD_BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 올릴 파일 검사. 문제가 있으면 오류 문구 목록 */
export function validateUploadFiles(files: { name: string; size: number }[], existingCount = 0): string[] {
  const errors: string[] = [];
  if (existingCount + files.length > BOARD_FILES_PER_POST) {
    errors.push(`첨부파일은 글 하나에 최대 ${BOARD_FILES_PER_POST}개까지 올릴 수 있습니다`);
  }
  for (const f of files) {
    if (isBlockedFile(f.name)) errors.push(`${f.name}: 실행 파일 형식은 올릴 수 없습니다`);
    else if (f.size > BOARD_FILE_MAX_BYTES) errors.push(`${f.name}: 파일 하나는 ${formatFileSize(BOARD_FILE_MAX_BYTES)}까지 올릴 수 있습니다`);
    else if (f.size === 0) errors.push(`${f.name}: 빈 파일입니다`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > BOARD_UPLOAD_TOTAL_MAX_BYTES) {
    errors.push(`한 번에 올리는 파일 합계는 ${formatFileSize(BOARD_UPLOAD_TOTAL_MAX_BYTES)}까지입니다`);
  }
  return errors;
}

/** 새 탭에서 바로 볼 수 있는 형식 (확장자 기준, SVG처럼 스크립트를 담을 수 있는 형식은 제외) */
const VIEWABLE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

/** 바로 보기가 가능하면 Content-Type, 아니면 null */
export function viewableType(name: string): string | null {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? null : (VIEWABLE_TYPES[name.slice(dot).toLowerCase()] ?? null);
}

/** 한국 시간 표시 */
export function formatBoardDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    ...(withTime && { timeStyle: "short" }),
  });
}

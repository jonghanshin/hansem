import "server-only";

// 게시판 서식 있는 글(HTML) 정리.
// 편집기가 만드는 태그·스타일만 남기고 스크립트·이벤트 속성·외부 이미지 등은 모두 지운다.
// 저장할 때 한 번, 화면에 그릴 때 한 번 더 거친다 (DB를 직접 고친 경우에도 안전하도록).

import sanitizeHtml from "sanitize-html";

import { BOARD_IMAGE_NAME_RE, BOARD_IMAGE_PATH } from "@/lib/board-shared";

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)$/i, /^inherit$/];
const SIZE = [/^\d{1,4}(\.\d+)?px$/];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "strike", "mark", "span", "a",
    "ul", "ol", "li", "blockquote", "pre", "code", "hr",
    "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td", "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    mark: ["data-color", "style"],
    td: ["colspan", "rowspan", "colwidth", "style"],
    th: ["colspan", "rowspan", "colwidth", "style"],
    col: ["style", "span"],
    table: ["style"],
    "*": ["style"],
  },
  allowedStyles: {
    "*": {
      color: COLOR,
      "background-color": COLOR,
      "text-align": [/^(left|right|center|justify)$/],
    },
    table: { "min-width": SIZE, width: SIZE },
    col: { "min-width": SIZE, width: SIZE },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  transformTags: {
    // 링크는 항상 새 탭 + opener 차단
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
  // 이미지는 이 게시판에 올린 것만 (외부 주소·data: 주소는 지운다)
  exclusiveFilter: (frame) => frame.tag === "img" && !isOwnImage(frame.attribs.src),
};

function isOwnImage(src: string | undefined): boolean {
  if (!src?.startsWith(BOARD_IMAGE_PATH)) return false;
  return BOARD_IMAGE_NAME_RE.test(src.slice(BOARD_IMAGE_PATH.length));
}

export function sanitizeBoardHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/**
 * 글 보기 화면용 HTML: 정리한 뒤, 문단 끝의 줄바꿈(<br>)이 화면에 보이게 한다.
 * 브라우저는 블록 맨 끝의 <br>을 빈 줄로 그리지 않는데, 편집기(ProseMirror)는 그 자리에 <br>을 하나 더 넣어
 * 빈 줄을 보여 준다. 보기 화면도 같게 맞춘다 (저장된 내용은 바꾸지 않는다).
 */
export function renderBoardHtml(html: string): string {
  return sanitizeBoardHtml(html).replace(/<br\s*\/?>(\s*)<\/(p|li|h[1-4]|blockquote|td|th)>/gi, "<br /><br />$1</$2>");
}

/** 글에 들어 있는 텍스트만 (내용이 비었는지 확인용) */
export function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim();
}

/** 글 본문이 쓰는 이미지 파일명 목록 */
export function imageNamesIn(html: string): string[] {
  const names = new Set<string>();
  const re = new RegExp(`src="${BOARD_IMAGE_PATH.replace(/\//g, "\\/")}([^"]+)"`, "g");
  for (const m of html.matchAll(re)) if (BOARD_IMAGE_NAME_RE.test(m[1])) names.add(m[1]);
  return [...names];
}

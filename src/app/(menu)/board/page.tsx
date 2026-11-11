import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { fetchBoardList, type BoardSearchField } from "@/lib/board";
import {
  BOARD_CATEGORIES,
  BOARD_CATEGORY_BADGE,
  BOARD_PAGE_SIZE,
  formatBoardDate,
  isBoardCategory,
  type BoardCategory,
  type BoardPostSummary,
} from "@/lib/board-shared";

export const metadata = { title: "게시판 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const FIELDS: { value: BoardSearchField; label: string }[] = [
  { value: "all", label: "제목+내용" },
  { value: "title", label: "제목" },
  { value: "author", label: "작성자" },
];

export default function BoardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">게시판을 불러오는 중…</p>}>
        <BoardList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

async function BoardList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  await requireUser();
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const field = (FIELDS.some((f) => f.value === one(sp.field)) ? one(sp.field) : "all") as BoardSearchField;
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  const rawCat = one(sp.cat);
  const category = isBoardCategory(rawCat) ? rawCat : null;

  const result = await fetchBoardList({ page, q, field, category }).then(
    (data) => ({ ok: true as const, ...data }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">게시판을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }

  const { notices, posts, total } = result;
  const lastPage = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (category) params.set("cat", category);
    if (q) params.set("q", q);
    if (q && field !== "all") params.set("field", field);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/board?${s}` : "/board";
  };
  // 현재 페이지 주변 최대 10개 페이지 번호
  const start = Math.max(1, Math.min(page - 4, lastPage - 9));
  const pages = Array.from({ length: Math.min(10, lastPage - start + 1) }, (_, i) => start + i);

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 bg-white px-4 pt-3 sm:px-6">
        <h1 className="pb-3 text-lg font-semibold text-zinc-900">
          게시판 <span className="ml-1 text-sm font-normal text-zinc-500">{total.toLocaleString()}건</span>
        </h1>
        <nav className="flex gap-1 self-end" aria-label="게시판 카테고리">
          {[null, ...BOARD_CATEGORIES].map((c) => {
            const active = c === category;
            return (
              <Link
                key={c ?? "all"}
                href={c ? `/board?cat=${encodeURIComponent(c)}` : "/board"}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium ${
                  active ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {c ?? "전체"}
              </Link>
            );
          })}
        </nav>
        <form action="/board" className="ml-auto flex flex-wrap items-center gap-2 pb-3" role="search">
          {category && <input type="hidden" name="cat" value={category} />}
          <select name="field" defaultValue={field} className={INPUT} aria-label="검색 대상">
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="검색어"
            className={`${INPUT} w-36 sm:w-48`}
            aria-label="검색어"
          />
          <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
            검색
          </button>
          {q && (
            <Link
              href={category ? `/board?cat=${encodeURIComponent(category)}` : "/board"}
              className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline"
            >
              초기화
            </Link>
          )}
          <Link
            href={category ? `/board/new?cat=${encodeURIComponent(category)}` : "/board/new"}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 글쓰기
          </Link>
        </form>
      </header>

      <div className="flex-1 lg:min-h-0 lg:overflow-auto">
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            {/* 넓은 화면: 표 */}
            <table className="hidden w-full text-sm sm:table">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="w-16 px-3 py-2 text-center font-medium">번호</th>
                  <th className="px-3 py-2 text-left font-medium">제목</th>
                  <th className="w-28 px-3 py-2 text-center font-medium">작성자</th>
                  <th className="w-28 px-3 py-2 text-center font-medium">작성일</th>
                  <th className="w-16 px-3 py-2 text-center font-medium">조회</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {[...notices, ...posts].map((p) => (
                  <tr key={p.id} className={p.notice ? "bg-amber-50/60" : "hover:bg-zinc-50"}>
                    <td className="px-3 py-2.5 text-center text-xs text-zinc-500 tabular-nums">
                      {p.notice ? <NoticeBadge /> : p.id}
                    </td>
                    <td className="px-3 py-2.5">
                      <PostTitleLink p={p} />
                    </td>
                    <td className="px-3 py-2.5 text-center text-zinc-700">{p.authorName ?? "-"}</td>
                    <td className="px-3 py-2.5 text-center text-zinc-500 tabular-nums">{formatBoardDate(p.createdAt)}</td>
                    <td className="px-3 py-2.5 text-center text-zinc-500 tabular-nums">{p.views.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 모바일: 카드 목록 */}
            <ul className="divide-y divide-zinc-100 sm:hidden">
              {[...notices, ...posts].map((p) => (
                <li key={p.id} className={`px-4 py-3 ${p.notice ? "bg-amber-50/60" : ""}`}>
                  <div className="flex items-center gap-2">
                    {p.notice && <NoticeBadge />}
                    <PostTitleLink p={p} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {p.authorName ?? "-"} · {formatBoardDate(p.createdAt)} · 조회 {p.views.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>

            {notices.length + posts.length === 0 && (
              <p className="px-6 py-16 text-center text-sm text-zinc-500">
                {q ? "검색 결과가 없습니다." : "등록된 글이 없습니다. '+ 글쓰기'로 첫 글을 남겨 보세요."}
              </p>
            )}
          </div>

          {lastPage > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-center gap-1 text-sm" aria-label="페이지">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1} label="이전" />
              {pages.map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={`min-w-8 rounded-md px-2 py-1 text-center tabular-nums ${
                    p === page ? "bg-zinc-900 font-semibold text-white" : "text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {p}
                </Link>
              ))}
              <PageLink href={pageHref(page + 1)} disabled={page >= lastPage} label="다음" />
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function PostTitleLink({ p }: { p: BoardPostSummary }) {
  return (
    <Link href={`/board/${p.id}`} className={`min-w-0 break-all text-zinc-900 hover:text-blue-700 hover:underline ${p.notice ? "font-semibold" : ""}`}>
      {p.category && <CategoryBadge category={p.category} />}
      {p.title}
      {p.fileCount > 0 && (
        <span className="ml-1.5 text-xs text-zinc-400" title={`첨부파일 ${p.fileCount}개`}>
          📎{p.fileCount}
        </span>
      )}
    </Link>
  );
}

function CategoryBadge({ category }: { category: BoardCategory }) {
  return (
    <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-[1px] text-[11px] font-semibold ${BOARD_CATEGORY_BADGE[category]}`}>
      {category}
    </span>
  );
}

function NoticeBadge() {
  return <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">공지</span>;
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) return <span className="rounded-md px-2 py-1 text-zinc-300">{label}</span>;
  return (
    <Link href={href} className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-200">
      {label}
    </Link>
  );
}

const INPUT =
  "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

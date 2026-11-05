"use client";

import { useState } from "react";

import { pageNumbers } from "@/lib/paging";

export const PAGE_SIZE = 100;

/** 페이지를 바꾼 뒤 목록 맨 위로. 넓은 화면은 목록 영역을, 모바일은 창을 스크롤한다. */
export function scrollToListTop(el: HTMLElement | null) {
  if (!el) return;
  el.scrollTo({ top: 0 });
  if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
}

/**
 * 목록 페이징. 필터가 바뀌어 전체 페이지 수가 줄면 마지막 페이지로 맞춘다.
 * 필터를 바꿀 때 첫 페이지로 돌아가려면 reset()을 호출한다.
 */
export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    totalPages,
    pageItems: items.slice(start, start + pageSize),
    start, // 0부터 시작하는 첫 항목 위치
    total: items.length,
    pageSize,
    setPage,
    reset: () => setPage(1),
  };
}

export function Pagination({
  page,
  totalPages,
  total,
  start,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  start: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const end = Math.min(start + pageSize, total);
  const btn =
    "min-w-8 rounded-md px-2 py-1 text-sm tabular-nums disabled:cursor-not-allowed disabled:text-zinc-300";

  return (
    <nav
      aria-label="페이지"
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-white px-4 py-2 sm:px-6"
    >
      <p className="text-xs text-zinc-500 tabular-nums">
        총 {total.toLocaleString()}건 중 {(start + 1).toLocaleString()}–{end.toLocaleString()}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={`${btn} text-zinc-600 hover:bg-zinc-100`}
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            aria-label="첫 페이지"
          >
            «
          </button>
          <button
            type="button"
            className={`${btn} text-zinc-600 hover:bg-zinc-100`}
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-zinc-400">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPageChange(n)}
                aria-current={n === page ? "page" : undefined}
                className={`${btn} ${n === page ? "bg-zinc-900 font-semibold text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${btn} text-zinc-600 hover:bg-zinc-100`}
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            aria-label="다음 페이지"
          >
            ›
          </button>
          <button
            type="button"
            className={`${btn} text-zinc-600 hover:bg-zinc-100`}
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            aria-label="마지막 페이지"
          >
            »
          </button>
        </div>
      )}
    </nav>
  );
}

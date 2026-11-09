"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ExcelUploadDialog } from "@/app/excel-upload-dialog";
import { ExportButton } from "@/app/export-button";
import { siteExportTable } from "@/lib/export-rows";
import { Pagination, scrollToListTop, usePagination } from "@/app/pagination";
import { SiteForm } from "@/app/site-form";
import { formatMoney, type Salesperson, type Site } from "@/lib/sites";

type Panel = { kind: "none" } | { kind: "create" } | { kind: "edit"; id: number };

const SEARCH_KEYS = ["현장번호", "고객명", "고객전화번호", "영업사원", "현장주소", "계약경로", "공사품목"] as const;

/** 진행상태 검색 (목록의 진행/완료 표시와 같은 기준: 완료일이 있으면 완료) */
const STATUS_OPTIONS = ["전체", "진행", "완료"] as const;

/** 계약일 최신순, 계약일이 없는 현장은 맨 뒤 */
function compareByContractDateDesc(a: Site, b: Site) {
  if (a.계약일 === b.계약일) return b.id - a.id;
  if (!a.계약일) return 1;
  if (!b.계약일) return -1;
  return a.계약일 < b.계약일 ? 1 : -1;
}

export function SitesManager({
  initialSites,
  fixedSalesName = null,
  newSiteSales,
}: {
  initialSites: Site[];
  /** 새 현장에 자동으로 넣을 로그인한 영업사원 (권한 테이블 기준) */
  newSiteSales: Salesperson;
  /** RD 로그인이면 본인 이름 (신규·수정 시 영업사원 고정) */
  fixedSalesName?: string | null;
}) {
  const [sites, setSites] = useState(initialSites);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("전체");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 저장하지 않은 수정이 있으면 탭을 닫을 때 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function confirmDiscard() {
    if (dirtyRef.current && !window.confirm("저장하지 않은 변경 사항이 있습니다. 버리시겠습니까?")) return false;
    dirtyRef.current = false;
    return true;
  }

  function openPanel(next: Panel) {
    if (panel.kind === next.kind && (next.kind !== "edit" || (panel.kind === "edit" && panel.id === next.id))) return;
    if (!confirmDiscard()) return;
    setPanel(next);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/-/g, "");
    return sites
      .filter(
        (s) =>
          (status === "전체" || (status === "완료") === !!s.완료일) &&
          (!q || SEARCH_KEYS.some((k) => (s[k] ?? "").toLowerCase().replace(/-/g, "").includes(q))),
      )
      .sort(compareByContractDateDesc);
  }, [sites, query, status]);

  const paging = usePagination(filtered);
  const listRef = useRef<HTMLDivElement>(null);
  function goToPage(page: number) {
    paging.setPage(page);
    scrollToListTop(listRef.current);
  }

  const selected = panel.kind === "edit" ? (sites.find((s) => s.id === panel.id) ?? null) : null;
  const panelOpen = panel.kind === "create" || selected !== null;

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900">
          현장정보 <span className="ml-1 text-sm font-normal text-zinc-500">{sites.length}건</span>
        </h1>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="flex items-center gap-1.5 text-sm text-zinc-700">
            진행상태
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as (typeof STATUS_OPTIONS)[number]);
                paging.reset();
              }}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              paging.reset();
            }}
            placeholder="현장번호, 고객명, 주소, 영업사원 검색"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:w-72 sm:flex-none"
          />
          <ExportButton count={filtered.length} fileBase="현장정보" build={() => siteExportTable(filtered)} />
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            엑셀 업로드
          </button>
          <button
            type="button"
            onClick={() => openPanel({ kind: "create" })}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 새 현장
          </button>
        </div>
      </header>

      <div className="flex flex-1 lg:min-h-0">
        {/* 목록 */}
        <div className="flex min-w-0 flex-1 flex-col bg-white">
        <div ref={listRef} className="flex-1 scroll-mt-11 lg:min-h-0 lg:overflow-auto">
          {/* 모바일: 카드 목록 */}
          <ul className="divide-y divide-zinc-100 lg:hidden">
            {paging.pageItems.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => openPanel({ kind: "edit", id: s.id })}
                  className="block w-full px-4 py-3 text-left active:bg-zinc-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusBadge done={!!s.완료일} />
                      <span className="truncate font-medium text-zinc-900">{s.고객명 || "(고객명 없음)"}</span>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{s.현장번호}</span>
                  </div>
                  {s.현장주소 && <p className="mt-1 truncate text-sm text-zinc-600">{s.현장주소}</p>}
                  <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
                    <span className="min-w-0 truncate">
                      {[s.영업사원, s.공사품목, s.계약일 && `계약 ${s.계약일}`, s.고객전화번호]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {s.계약가 !== null && (
                      <span className="shrink-0 text-sm font-medium text-zinc-900 tabular-nums">{formatMoney(s.계약가)}</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* 넓은 화면: 표 */}
          <table className="hidden w-full text-left text-sm lg:table">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-600 shadow-[inset_0_-1px_0] shadow-zinc-200">
              <tr>
                <Th>상태</Th>
                <Th>현장번호</Th>
                <Th>고객명</Th>
                <Th>전화번호</Th>
                <Th>영업사원</Th>
                <Th>현장주소</Th>
                <Th>계약경로</Th>
                <Th right>계약가</Th>
                <Th>공사품목</Th>
                <Th>공사시기</Th>
                <Th>계약일</Th>
                <Th>완료일</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {paging.pageItems.map((s) => {
                const active = selected?.id === s.id;
                return (
                  <tr
                    key={s.id}
                    onClick={() => openPanel({ kind: "edit", id: s.id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPanel({ kind: "edit", id: s.id });
                      }
                    }}
                    tabIndex={0}
                    aria-selected={active}
                    className={`cursor-pointer outline-none focus-visible:bg-blue-50 ${
                      active ? "bg-blue-50 shadow-[inset_3px_0] shadow-blue-600" : "hover:bg-zinc-50"
                    }`}
                  >
                    <Td>
                      <StatusBadge done={!!s.완료일} />
                    </Td>
                    <Td mono>{s.현장번호}</Td>
                    <Td strong>{s.고객명}</Td>
                    <Td mono>{s.고객전화번호}</Td>
                    <Td>{s.영업사원}</Td>
                    <td className="max-w-72 truncate px-3 py-2 text-zinc-700" title={s.현장주소 ?? ""}>
                      {s.현장주소}
                    </td>
                    <Td>{s.계약경로}</Td>
                    <Td right mono>{formatMoney(s.계약가)}</Td>
                    <Td>{s.공사품목}</Td>
                    <Td mono>{s.공사시기}</Td>
                    <Td mono>{s.계약일}</Td>
                    <Td mono>{s.완료일}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-6 py-16 text-center text-sm text-zinc-500">
              {sites.length === 0 ? "등록된 현장정보가 없습니다. '+ 새 현장' 또는 '엑셀 업로드'로 추가하세요." : "검색 결과가 없습니다."}
            </p>
          )}
        </div>
        <Pagination {...paging} onPageChange={goToPage} />
        </div>

        {/* 오른쪽 상세 패널 */}
        {panelOpen && (
          <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-zinc-200 bg-white shadow-xl lg:static lg:z-auto lg:w-1/2 lg:max-w-none lg:shrink-0 lg:shadow-none">
            <SiteForm
              key={panel.kind === "create" ? "new" : selected!.id}
              site={panel.kind === "create" ? null : selected}
              fixedSalesName={fixedSalesName}
              newSiteSales={newSiteSales}
              onDirtyChange={(d) => {
                dirtyRef.current = d;
              }}
              onClose={() => {
                if (confirmDiscard()) setPanel({ kind: "none" });
              }}
              onSynced={(synced) => setSites((prev) => prev.map((s) => (s.id === synced.id ? synced : s)))}
              onSaved={(saved, created) => {
                setSites((prev) => (created ? [saved, ...prev] : prev.map((s) => (s.id === saved.id ? saved : s))));
                if (created) {
                  setPanel({ kind: "edit", id: saved.id });
                  goToPage(1); // 새 현장은 목록 맨 위(1페이지)에 추가됨
                }
                setToast(created ? "새 현장을 등록했습니다" : "저장했습니다");
              }}
            />
          </aside>
        )}
      </div>

      {uploadOpen && (
        <ExcelUploadDialog
          onClose={() => setUploadOpen(false)}
          onInserted={(inserted) => {
            setSites((prev) => [...[...inserted].sort((a, b) => b.id - a.id), ...prev]);
            goToPage(1);
            setUploadOpen(false);
            setToast(`${inserted.length}건을 등록했습니다`);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ done }: { done: boolean }) {
  return done ? (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">완료</span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">진행</span>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-3 py-2.5 font-medium ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  mono,
  strong,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 ${right ? "text-right" : ""} ${mono ? "tabular-nums" : ""} ${
        strong ? "font-medium text-zinc-900" : "text-zinc-700"
      }`}
    >
      {children}
    </td>
  );
}

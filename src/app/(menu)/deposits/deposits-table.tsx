"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { deleteDepositAction } from "@/app/actions";
import { ExportButton } from "@/app/export-button";
import { Pagination, scrollToListTop, usePagination } from "@/app/pagination";
import { depositExportTable } from "@/lib/export-rows";

import type { RequestKind } from "@/lib/approvals";
import { DEPOSIT_TYPES, type Deposit } from "@/lib/deposits";
import { formatMoney, type SiteSummary } from "@/lib/sites";

import { DepositDetailDialog } from "./deposit-detail-dialog";
import { DepositFormDialog } from "./deposit-form-dialog";

type Kind = "전체" | "입금" | "출금";

/** 현장 상태 검색: all = 전체, active = 진행 중 현장만(기본), done = 완료 현장만 (현장정보.완료일 기준) */
type SiteStatus = "all" | "active" | "done";

type Filters = {
  현장상태: SiteStatus;
  현장번호: string;
  고객명: string;
  영업사원: string; // "" = 전체
  입금자: string;
  입금구분: string; // "" = 전체
  dateFrom: string; // YYYY-MM-DD, "" = 제한 없음
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  현장상태: "active", // 기본: 진행 중 현장만
  현장번호: "",
  고객명: "",
  영업사원: "",
  입금자: "",
  입금구분: "",
  dateFrom: "",
  dateTo: "",
};

function includesText(value: string | null, q: string) {
  const needle = q.trim().toLowerCase();
  return !needle || (value ?? "").toLowerCase().includes(needle);
}

function distinct(deposits: Deposit[], key: "영업사원" | "입금구분" | "입금자" | "입금처" | "현금영수증") {
  return [...new Set(deposits.map((d) => d[key]).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
}

export function DepositsTable({
  initialDeposits,
  sites,
  fixedSalesName = null,
  loginName,
  isAdmin = false,
  pendingTargets,
}: {
  initialDeposits: Deposit[];
  sites: SiteSummary[];
  /** 입금내역 id → 승인 대기 중인 수정/삭제 요청 */
  pendingTargets: Record<number, RequestKind>;
  /** RD 로그인이면 본인 이름 (입금 등록 시 영업사원 고정) */
  fixedSalesName?: string | null;
  /** 로그인한 사용자 이름 (입금 등록 시 현장번호 선택 목록을 본인 현장으로 좁힘) */
  loginName: string;
  /** CEO·관리자: 삭제 버튼 표시, 진행 중인 전체 현장 선택 가능 */
  isAdmin?: boolean;
}) {
  const [deposits, setDeposits] = useState(initialDeposits);
  // 이 화면은 이동해도 숨겨진 채 보관되므로, 서버에서 새 목록(예: 승인 후)이 오면 반영한다
  const [prevInitial, setPrevInitial] = useState(initialDeposits);
  if (initialDeposits !== prevInitial) {
    setPrevInitial(initialDeposits);
    setDeposits(initialDeposits);
  }
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [kind, setKind] = useState<Kind>("전체");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deposit | null>(null);
  // 더블클릭으로 연 상세 팝업
  const [viewing, setViewing] = useState<Deposit | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletePending, startDelete] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const salesOptions = useMemo(() => distinct(deposits, "영업사원"), [deposits]);
  // 현장번호 검색 선택 목록: 현장 상태 검색에 맞는 현장 (기본은 진행 중 = 완료일 없음)
  // 관리자는 전체, 그 외는 본인(영업사원 = 로그인 이름) 현장
  const siteStatus = filters.현장상태;
  const siteOptions = useMemo(() => {
    const matched = sites.filter(
      (s) => s.현장번호 && (siteStatus === "done" ? !!s.완료일 : siteStatus === "all" || !s.완료일),
    );
    if (isAdmin) return matched;
    const me = loginName.trim();
    return matched.filter((s) => s.영업사원?.trim() === me);
  }, [sites, loginName, isAdmin, siteStatus]);
  // 정해진 입금구분 + 기존 데이터에만 있는 값
  const typeOptions = useMemo(() => {
    const extra = distinct(deposits, "입금구분").filter((v) => !(DEPOSIT_TYPES as readonly string[]).includes(v));
    return [...DEPOSIT_TYPES, ...extra];
  }, [deposits]);

  // 완료일이 있는 현장번호 (현장정보에 없는 현장번호는 진행 중으로 본다)
  const doneSites = useMemo(
    () => new Set(sites.filter((s) => s.현장번호 && s.완료일).map((s) => s.현장번호!.trim())),
    [sites],
  );

  const filtered = useMemo(() => {
    const { 현장상태, 현장번호, 고객명, 영업사원, 입금자, 입금구분, dateFrom, dateTo } = filters;
    const hasDateFilter = !!(dateFrom || dateTo);
    const isDone = (d: Deposit) => doneSites.has(d.현장번호?.trim() ?? "");
    return deposits.filter(
      (d) =>
        (현장상태 === "all" || (현장상태 === "done") === isDone(d)) &&
        (kind === "전체" || d.입출금 === kind) &&
        includesText(d.현장번호, 현장번호) &&
        includesText(d.고객명, 고객명) &&
        includesText(d.입금자, 입금자) &&
        (!영업사원 || d.영업사원 === 영업사원) &&
        (!입금구분 || d.입금구분 === 입금구분) &&
        // 기간 검색 시 날짜를 해석할 수 없는 행은 제외
        (!hasDateFilter ||
          (d.dateIso !== null && (!dateFrom || d.dateIso >= dateFrom) && (!dateTo || d.dateIso <= dateTo))),
    );
  }, [deposits, filters, kind, doneSites]);

  const paging = usePagination(filtered);
  const listRef = useRef<HTMLDivElement>(null);
  function goToPage(page: number) {
    paging.setPage(page);
    scrollToListTop(listRef.current);
  }
  // 모바일에서는 검색 조건을 접어 두고 버튼으로 연다
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 기본값과 다른 검색 조건 수 (현장 상태 기본값 '진행 중 현장만'은 세지 않음)
  const activeFilterCount = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] !== EMPTY_FILTERS[k]).length;

  // 검색 조건이 바뀌면 첫 페이지로
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    paging.reset();
  };
  const isFiltered = kind !== "전체" || activeFilterCount > 0;
  const dateRangeInvalid = !!(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);

  function requestDelete(d: Deposit) {
    const label = `${d.dateIso ?? d.날짜 ?? ""} ${d.고객명 ?? d.현장번호 ?? ""} ${d.입출금 ?? ""} ${d.입금액 ?? ""}원`;
    if (!window.confirm(`${label}\n\n이 입금내역을 삭제하시겠습니까?\n바로 삭제되며 되돌릴 수 없습니다.`)) return;
    setDeletingId(d.id);
    startDelete(async () => {
      const res = await deleteDepositAction(d.id);
      setDeletingId(null);
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      setDeposits((prev) => prev.filter((x) => x.id !== d.id));
      setViewing(null);
      setToast("입금내역을 삭제했습니다");
    });
  }

  /** 행별 수정/삭제 버튼. 이미 승인 대기 중인 요청이 있으면 상태만 표시 */
  function rowActions(d: Deposit) {
    const waiting = pendingTargets[d.id];
    if (waiting) {
      return (
        <span className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
          {waiting} 승인대기
        </span>
      );
    }
    return (
      <span className="inline-flex gap-1">
        <button
          type="button"
          onClick={() => {
            setViewing(null);
            setEditing(d);
          }}
          disabled={deletePending}
          className="whitespace-nowrap rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
        >
          수정
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => requestDelete(d)}
            disabled={deletePending}
            className="whitespace-nowrap rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deletingId === d.id ? "삭제 중…" : "삭제"}
          </button>
        )}
      </span>
    );
  }

  /** 행 더블클릭 → 상세 팝업 (행 안의 수정/삭제 버튼을 누른 경우는 제외) */
  function openDetail(e: React.MouseEvent, d: Deposit) {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    window.getSelection()?.removeAllRanges();
    setViewing(d);
  }
  /** 키보드: 행에 포커스가 있을 때 Enter로 상세 팝업 */
  function onRowKey(e: React.KeyboardEvent, d: Deposit) {
    if (e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      setViewing(d);
    }
  }

  const inTotal = sum(filtered.filter((d) => d.입출금 === "입금"));
  const outTotal = sum(filtered.filter((d) => d.입출금 === "출금"));

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900">
          입금내역{" "}
          <span className="ml-1 text-sm font-normal text-zinc-500">
            {filtered.length === deposits.length ? `${deposits.length}건` : `${filtered.length} / ${deposits.length}건`}
          </span>
        </h1>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex rounded-md border border-zinc-300 bg-white p-0.5" role="group" aria-label="입출금 구분">
            {(["전체", "입금", "출금"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  paging.reset();
                }}
                aria-pressed={kind === k}
                className={`rounded px-3 py-1 text-sm font-medium ${
                  kind === k ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <ExportButton count={filtered.length} fileBase="입금내역" build={() => depositExportTable(filtered)} />
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 입금 등록
          </button>
        </div>
      </header>

      {(formOpen || editing) && (
        <DepositFormDialog
          key={editing?.id ?? "new"}
          sites={sites}
          fixedSalesName={fixedSalesName}
          loginName={loginName}
          isAdmin={isAdmin}
          editing={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onDone={(message) => {
            // 승인필요입금내역에 '승인대기' 요청으로 들어감. CEO가 승인해야 이 목록에 반영된다.
            setFormOpen(false);
            setEditing(null);
            setToast(message);
          }}
        />
      )}

      {viewing && (
        <DepositDetailDialog
          deposit={viewing}
          waiting={pendingTargets[viewing.id]}
          actions={rowActions(viewing)}
          onClose={() => setViewing(null)}
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

      {/* 항목별 검색 (모바일은 접기/펼치기) */}
      <div className="shrink-0 border-b border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        aria-expanded={filtersOpen}
        aria-controls="deposit-filters"
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-zinc-700 lg:hidden"
      >
        <span>
          검색 조건
          {activeFilterCount > 0 && (
            <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </span>
        <span aria-hidden className="text-zinc-400">
          {filtersOpen ? "▲" : "▼"}
        </span>
      </button>
      <form
        id="deposit-filters"
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 items-end gap-x-3 gap-y-2 px-4 pb-3 sm:px-6 lg:flex lg:flex-wrap lg:py-3`}
      >
        <Field label="현장 상태">
          <select
            value={filters.현장상태}
            onChange={(e) => setFilter("현장상태", e.target.value as SiteStatus)}
            title="현장정보의 완료일 기준 (완료일이 있으면 완료 현장)"
            className={`${INPUT} w-full lg:w-36`}
          >
            <option value="all">전체 (완료 포함)</option>
            <option value="active">진행 중 현장만</option>
            <option value="done">완료 현장만</option>
          </select>
        </Field>
        <Field label="현장번호">
          <input
            type="search"
            list="deposit-filter-sites"
            value={filters.현장번호}
            onChange={(e) => setFilter("현장번호", e.target.value)}
            placeholder={siteOptions.length ? "선택 또는 입력" : "예: 261022C"}
            title="진행 중인 내 현장에서 선택하거나 번호 일부를 입력하세요"
            className={`${INPUT} w-full lg:w-40`}
          />
          <datalist id="deposit-filter-sites">
            {siteOptions.map((s) => (
              <option key={s.현장번호} value={s.현장번호 ?? ""}>
                {[s.고객명, s.영업사원].filter(Boolean).join(" · ")}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="고객명">
          <input
            type="search"
            value={filters.고객명}
            onChange={(e) => setFilter("고객명", e.target.value)}
            placeholder="이름 일부"
            className={`${INPUT} w-full lg:w-32`}
          />
        </Field>
        <Field label="영업사원">
          <select value={filters.영업사원} onChange={(e) => setFilter("영업사원", e.target.value)} className={`${INPUT} w-full lg:w-32`}>
            <option value="">전체</option>
            {salesOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="입금자">
          <input
            type="search"
            value={filters.입금자}
            onChange={(e) => setFilter("입금자", e.target.value)}
            placeholder="이름 일부"
            className={`${INPUT} w-full lg:w-32`}
          />
        </Field>
        <Field label="입금구분">
          <select value={filters.입금구분} onChange={(e) => setFilter("입금구분", e.target.value)} className={`${INPUT} w-full lg:w-32`}>
            <option value="">전체</option>
            {typeOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="날짜" className="col-span-2">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              aria-label="시작일"
              className={`${INPUT} min-w-0 flex-1 lg:w-36 lg:flex-none`}
            />
            <span className="text-sm text-zinc-400">~</span>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              aria-label="종료일"
              className={`${INPUT} min-w-0 flex-1 lg:w-36 lg:flex-none`}
            />
          </div>
        </Field>
        <button
          type="button"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            paging.reset();
            setKind("전체");
          }}
          disabled={!isFiltered}
          className="col-span-2 rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent lg:border-0"
        >
          초기화
        </button>
        {dateRangeInvalid && <p className="col-span-2 w-full text-xs text-red-600">시작일이 종료일보다 늦습니다.</p>}
      </form>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-px border-b border-zinc-200 bg-zinc-200">
        <Stat label="입금 합계" value={inTotal} className="text-emerald-700" />
        <Stat label="출금 합계" value={outTotal} className="text-red-600" />
        <Stat label="입금 − 출금" value={inTotal - outTotal} className="text-zinc-900" />
      </div>

      <div ref={listRef} className="flex-1 scroll-mt-11 bg-white lg:min-h-0 lg:overflow-auto">
        {/* 모바일: 카드 목록 */}
        <ul className="divide-y divide-zinc-100 lg:hidden">
          {paging.pageItems.map((d) => {
            const isIn = d.입출금 === "입금";
            const isOut = d.입출금 === "출금";
            const detail = [d.입금자, d.입금내용].filter(Boolean).join(" · ");
            return (
              <li
                key={d.id}
                onDoubleClick={(e) => openDetail(e, d)}
                onKeyDown={(e) => onRowKey(e, d)}
                tabIndex={0}
                title="더블클릭하면 상세 내용을 봅니다"
                className="cursor-pointer px-4 py-3 select-none focus-visible:bg-blue-50 focus-visible:outline-none"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {d.입출금 && <span className={`shrink-0 ${kindBadge(d.입출금)}`}>{d.입출금}</span>}
                    {d.입금구분 && <span className="truncate text-xs text-zinc-500">{d.입금구분}</span>}
                  </div>
                  <span
                    className={`shrink-0 text-base font-semibold tabular-nums ${
                      isIn ? "text-emerald-700" : isOut ? "text-red-600" : "text-zinc-900"
                    }`}
                  >
                    {d.amount !== null ? formatMoney(d.amount) : d.입금액}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                  <p className="min-w-0 truncate">
                    <span className="font-medium text-zinc-900">{d.고객명 ?? "—"}</span>{" "}
                    <span className="text-xs text-zinc-500 tabular-nums">{d.현장번호}</span>
                  </p>
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{d.dateIso ?? d.날짜}</span>
                </div>
                {(detail || d.영업사원) && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {[d.영업사원 && `영업 ${d.영업사원}`, detail].filter(Boolean).join(" · ")}
                  </p>
                )}
                {d.현금영수증 && <p className="mt-0.5 text-xs text-zinc-500">현금영수증: {d.현금영수증}</p>}
                <div className="mt-2 flex justify-end">{rowActions(d)}</div>
              </li>
            );
          })}
        </ul>

        {/* 넓은 화면: 표 */}
        <table className="hidden w-full text-left text-sm lg:table">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-600 shadow-[inset_0_-1px_0] shadow-zinc-200">
            <tr>
              <Th>날짜</Th>
              <Th>현장번호</Th>
              <Th>고객명</Th>
              <Th>영업사원</Th>
              <Th>입출금</Th>
              <Th right>금액</Th>
              <Th>입금자</Th>
              <Th>입금내용</Th>
              <Th>입금구분</Th>
              <Th>현금영수증</Th>
              <Th>관리</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {paging.pageItems.map((d) => {
              const isIn = d.입출금 === "입금";
              const isOut = d.입출금 === "출금";
              return (
                <tr
                  key={d.id}
                  onDoubleClick={(e) => openDetail(e, d)}
                  onKeyDown={(e) => onRowKey(e, d)}
                  tabIndex={0}
                  title="더블클릭하면 상세 내용을 봅니다"
                  className="cursor-pointer select-none hover:bg-zinc-50 focus-visible:bg-blue-50 focus-visible:outline-none"
                >
                  <Td mono>{d.dateIso ?? d.날짜}</Td>
                  <Td mono>{d.현장번호}</Td>
                  <Td strong>{d.고객명}</Td>
                  <Td>{d.영업사원}</Td>
                  <Td>
                    {d.입출금 && <span className={kindBadge(d.입출금)}>{d.입출금}</span>}
                  </Td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${
                      isIn ? "text-emerald-700" : isOut ? "text-red-600" : "text-zinc-900"
                    }`}
                  >
                    {d.amount !== null ? formatMoney(d.amount) : d.입금액}
                  </td>
                  <Td>{d.입금자}</Td>
                  <td className="max-w-72 truncate px-3 py-2 text-zinc-700" title={d.입금내용 ?? ""}>
                    {d.입금내용}
                  </td>
                  <Td>{d.입금구분}</Td>
                  <Td>{d.현금영수증}</Td>
                  <td className="whitespace-nowrap px-3 py-2">{rowActions(d)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-6 py-16 text-center text-sm text-zinc-500">
            {deposits.length === 0 ? "입금내역이 없습니다." : "조건에 맞는 내역이 없습니다."}
          </p>
        )}
      </div>
      <Pagination {...paging} onPageChange={goToPage} />
    </div>
  );
}

const INPUT =
  "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function kindBadge(kind: string) {
  const color =
    kind === "입금" ? "bg-emerald-50 text-emerald-700" : kind === "출금" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600";
  return `rounded px-1.5 py-0.5 text-xs font-medium ${color}`;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function sum(rows: Deposit[]) {
  return rows.reduce((acc, d) => acc + (d.amount ?? 0), 0);
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="min-w-0 bg-white px-3 py-2 sm:px-6 sm:py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base ${className}`}>{formatMoney(value)}</p>
    </div>
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

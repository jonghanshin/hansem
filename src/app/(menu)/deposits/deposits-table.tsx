"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ExportButton } from "@/app/export-button";
import { Pagination, usePagination } from "@/app/pagination";
import { depositExportTable } from "@/lib/export-rows";

import { DEPOSIT_TYPES, sortDepositsDesc, type Deposit } from "@/lib/deposits";
import { formatMoney, type SiteSummary } from "@/lib/sites";

import { DepositFormDialog, type DepositSuggestions } from "./deposit-form-dialog";

type Kind = "전체" | "입금" | "출금";

type Filters = {
  현장번호: string;
  고객명: string;
  영업사원: string; // "" = 전체
  입금자: string;
  입금구분: string; // "" = 전체
  dateFrom: string; // YYYY-MM-DD, "" = 제한 없음
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
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

export function DepositsTable({ initialDeposits, sites }: { initialDeposits: Deposit[]; sites: SiteSummary[] }) {
  const [deposits, setDeposits] = useState(initialDeposits);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [kind, setKind] = useState<Kind>("전체");
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const salesOptions = useMemo(() => distinct(deposits, "영업사원"), [deposits]);
  // 정해진 입금구분 3가지 + 기존 데이터에만 있는 값
  const typeOptions = useMemo(() => {
    const extra = distinct(deposits, "입금구분").filter((v) => !(DEPOSIT_TYPES as readonly string[]).includes(v));
    return [...DEPOSIT_TYPES, ...extra];
  }, [deposits]);
  const suggestions = useMemo<DepositSuggestions>(
    () => ({
      입금자: distinct(deposits, "입금자"),
      입금처: distinct(deposits, "입금처"),
      현금영수증: distinct(deposits, "현금영수증"),
    }),
    [deposits],
  );

  const filtered = useMemo(() => {
    const { 현장번호, 고객명, 영업사원, 입금자, 입금구분, dateFrom, dateTo } = filters;
    const hasDateFilter = !!(dateFrom || dateTo);
    return deposits.filter(
      (d) =>
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
  }, [deposits, filters, kind]);

  const paging = usePagination(filtered);
  const listRef = useRef<HTMLDivElement>(null);
  function goToPage(page: number) {
    paging.setPage(page);
    listRef.current?.scrollTo({ top: 0 });
  }

  // 검색 조건이 바뀌면 첫 페이지로
  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    paging.reset();
  };
  const isFiltered = kind !== "전체" || Object.values(filters).some((v) => v !== "");
  const dateRangeInvalid = !!(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);

  const inTotal = sum(filtered.filter((d) => d.입출금 === "입금"));
  const outTotal = sum(filtered.filter((d) => d.입출금 === "출금"));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

      {formOpen && (
        <DepositFormDialog
          sites={sites}
          suggestions={suggestions}
          onClose={() => setFormOpen(false)}
          onCreated={(created) => {
            setDeposits((prev) => sortDepositsDesc([created, ...prev]));
            goToPage(1);
            setFormOpen(false);
            setToast(`${created.입출금 ?? ""} ${created.입금액 ?? ""}원을 등록했습니다`);
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

      {/* 항목별 검색 */}
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6"
      >
        <Field label="현장번호">
          <input
            type="search"
            value={filters.현장번호}
            onChange={(e) => setFilter("현장번호", e.target.value)}
            placeholder="예: 261022C"
            className={`${INPUT} w-40`}
          />
        </Field>
        <Field label="고객명">
          <input
            type="search"
            value={filters.고객명}
            onChange={(e) => setFilter("고객명", e.target.value)}
            placeholder="이름 일부"
            className={`${INPUT} w-32`}
          />
        </Field>
        <Field label="영업사원">
          <select value={filters.영업사원} onChange={(e) => setFilter("영업사원", e.target.value)} className={`${INPUT} w-32`}>
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
            className={`${INPUT} w-32`}
          />
        </Field>
        <Field label="입금구분">
          <select value={filters.입금구분} onChange={(e) => setFilter("입금구분", e.target.value)} className={`${INPUT} w-32`}>
            <option value="">전체</option>
            {typeOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="날짜">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              aria-label="시작일"
              className={`${INPUT} w-36`}
            />
            <span className="text-sm text-zinc-400">~</span>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              aria-label="종료일"
              className={`${INPUT} w-36`}
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
          className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
        >
          초기화
        </button>
        {dateRangeInvalid && <p className="w-full text-xs text-red-600">시작일이 종료일보다 늦습니다.</p>}
      </form>

      <div className="grid shrink-0 grid-cols-3 gap-px border-b border-zinc-200 bg-zinc-200">
        <Stat label="입금 합계" value={inTotal} className="text-emerald-700" />
        <Stat label="출금 합계" value={outTotal} className="text-red-600" />
        <Stat label="입금 − 출금" value={inTotal - outTotal} className="text-zinc-900" />
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="w-full text-left text-sm">
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
              <Th>입금처</Th>
              <Th>입금구분</Th>
              <Th right>계약가</Th>
              <Th>현금영수증</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {paging.pageItems.map((d, i) => {
              const isIn = d.입출금 === "입금";
              const isOut = d.입출금 === "출금";
              return (
                // 입금내역 테이블에는 고유 id가 없어 순번을 key로 사용
                <tr key={i} className="hover:bg-zinc-50">
                  <Td mono>{d.dateIso ?? d.날짜}</Td>
                  <Td mono>{d.현장번호}</Td>
                  <Td strong>{d.고객명}</Td>
                  <Td>{d.영업사원}</Td>
                  <Td>
                    {d.입출금 && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          isIn ? "bg-emerald-50 text-emerald-700" : isOut ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {d.입출금}
                      </span>
                    )}
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
                  <Td>{d.입금처}</Td>
                  <Td>{d.입금구분}</Td>
                  <Td right mono>{d.계약가}</Td>
                  <Td>{d.현금영수증}</Td>
                  <td className="max-w-60 truncate px-3 py-2 text-zinc-700" title={d.비고 ?? ""}>
                    {d.비고}
                  </td>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
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
    <div className="bg-white px-4 py-3 sm:px-6">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${className}`}>{formatMoney(value)}</p>
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

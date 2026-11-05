"use client";

import { useEffect, useId, useState } from "react";

import { listComputedSourcesAction } from "@/app/actions";
import { COMPUTED_FIELDS, formatMoney, type ComputedFieldKey, type ComputedSources } from "@/lib/sites";

/** 자동 계산 필드의 합계가 어떤 행들로 이루어졌는지 보여준다. */
export function ComputedSourcesDialog({
  siteNumber,
  field,
  onClose,
}: {
  siteNumber: string;
  field: ComputedFieldKey;
  onClose: () => void;
}) {
  const titleId = useId();
  const [data, setData] = useState<ComputedSources | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listComputedSourcesAction(siteNumber, field).then((res) => {
      if (cancelled) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [siteNumber, field]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85dvh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
              {field} 상세 내역
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              현장번호 {siteNumber} · {COMPUTED_FIELDS[field]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="닫기"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <p role="alert" className="m-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : !data ? (
            <p className="px-5 py-8 text-sm text-zinc-500">불러오는 중…</p>
          ) : data.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">합계에 포함된 내역이 없습니다.</p>
          ) : data.kind === "orders" ? (
            <OrdersTable data={data} />
          ) : (
            <DepositsTable data={data} />
          )}
        </div>
      </div>
    </div>
  );
}

const TH = "whitespace-nowrap px-3 py-2.5 font-medium";
const TD = "whitespace-nowrap px-3 py-2 text-zinc-700";

function OrdersTable({ data }: { data: Extract<ComputedSources, { kind: "orders" }> }) {
  const amountCols = ["공급가", "공급가(HS)", "공급가(S1)"] as const;
  const hl = (col: string) => (col === data.column ? "bg-blue-50 font-semibold text-blue-800" : "");
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-600 shadow-[inset_0_-1px_0] shadow-zinc-200">
        <tr>
          <th className={TH}>주문번호</th>
          <th className={TH}>주문등록일</th>
          <th className={TH}>공정</th>
          <th className={TH}>품목명</th>
          <th className={TH}>시공일</th>
          {amountCols.map((c) => (
            <th key={c} className={`${TH} text-right ${hl(c)}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {data.rows.map((r, i) => (
          <tr key={i}>
            <td className={`${TD} tabular-nums`}>{r.주문번호}</td>
            <td className={`${TD} tabular-nums`}>{r.주문등록일}</td>
            <td className={TD}>{r.공정}</td>
            <td className="max-w-72 truncate px-3 py-2 text-zinc-700" title={r.품목명 ?? ""}>
              {r.품목명}
            </td>
            <td className={`${TD} tabular-nums`}>{r.시공일}</td>
            {amountCols.map((c) => (
              <td key={c} className={`${TD} text-right tabular-nums ${hl(c)}`}>
                {formatMoney(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot className="sticky bottom-0 bg-white text-sm shadow-[inset_0_1px_0] shadow-zinc-200">
        <tr>
          <td colSpan={5} className="px-3 py-2.5 font-medium text-zinc-700">
            합계 ({data.rows.length}건)
          </td>
          {amountCols.map((c) => (
            <td key={c} className={`px-3 py-2.5 text-right tabular-nums ${hl(c)}`}>
              {c === data.column ? formatMoney(data.total) : ""}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

function DepositsTable({ data }: { data: Extract<ComputedSources, { kind: "deposits" }> }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-600 shadow-[inset_0_-1px_0] shadow-zinc-200">
        <tr>
          <th className={TH}>날짜</th>
          <th className={TH}>입출금</th>
          <th className={TH}>입금자</th>
          <th className={TH}>입금내용</th>
          <th className={TH}>입금처</th>
          <th className={`${TH} bg-blue-50 text-right text-blue-800`}>입금액</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {data.rows.map((r, i) => (
          <tr key={i}>
            <td className={`${TD} tabular-nums`}>{r.날짜}</td>
            <td className={TD}>{r.입출금}</td>
            <td className={TD}>{r.입금자}</td>
            <td className="max-w-72 truncate px-3 py-2 text-zinc-700" title={r.입금내용 ?? ""}>
              {r.입금내용}
            </td>
            <td className={TD}>{r.입금처}</td>
            <td className={`${TD} bg-blue-50 text-right font-semibold text-blue-800 tabular-nums`}>
              {formatMoney(r.입금액)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="sticky bottom-0 bg-white text-sm shadow-[inset_0_1px_0] shadow-zinc-200">
        <tr>
          <td colSpan={5} className="px-3 py-2.5 font-medium text-zinc-700">
            합계 ({data.rows.length}건)
          </td>
          <td className="bg-blue-50 px-3 py-2.5 text-right font-semibold text-blue-800 tabular-nums">
            {formatMoney(data.total)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

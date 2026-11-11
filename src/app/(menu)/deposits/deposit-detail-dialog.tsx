"use client";

import { useEffect, useId, useRef } from "react";

import type { RequestKind } from "@/lib/approvals";
import { ReceiptLink } from "@/app/receipt-link";
import type { Deposit } from "@/lib/deposits";
import { formatMoney } from "@/lib/sites";

/** 입금내역 한 건의 전체 내용 (목록에서 더블클릭) */
export function DepositDetailDialog({
  deposit: d,
  waiting,
  actions,
  onClose,
}: {
  deposit: Deposit;
  /** 승인 대기 중인 수정/삭제 요청 */
  waiting?: RequestKind;
  /** 하단 수정/삭제 버튼 (목록과 같은 동작) */
  actions: React.ReactNode;
  onClose: () => void;
}) {
  const idp = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const isIn = d.입출금 === "입금";
  const isOut = d.입출금 === "출금";
  const date = d.dateIso && d.dateIso !== d.날짜 ? `${d.dateIso} (${d.날짜})` : (d.dateIso ?? d.날짜);

  const altAccount = !!(d["대체계좌 은행"]?.trim() || d["대체계좌 예금주"]?.trim() || d["대체계좌 번호"]?.trim());
  const rows: [string, React.ReactNode][] = [
    ["날짜", date],
    ["현장번호", d.현장번호],
    ["고객명", d.고객명],
    ["영업사원", d.영업사원],
    ["계약가", d.계약가],
    ["입금구분", d.입금구분],
    ["입금자", d.입금자],
    ["입금내용", d.입금내용],
    ["입금처", d.입금처],
    ["현금영수증", d.현금영수증],
    ["부가세 포함", d.부가세포함],
    ["영수증 파일", <ReceiptLink key="receipt" value={d.영수증} />],
    ["비고", d.비고],
    ["A/S", d["A/S"]],
    ["공정", d.공정],
    ["세부공정", d.주요작업],
    ["업체", d.업체],
    ["업체담당자", d.업체담당자성함],
    ["업체연락처", d.업체담당자연락처],
    // 업체계좌·대체계좌 중 저장된 쪽만 보여준다 (대체계좌 값이 있으면 대체계좌)
    ...((altAccount
      ? [
          ["계좌", "대체계좌"],
          ["대체계좌 은행", d["대체계좌 은행"]],
          ["대체계좌 예금주", d["대체계좌 예금주"]],
          ["대체계좌 번호", d["대체계좌 번호"]],
        ]
      : [
          ["계좌", d.업체은행 || d.업체예금주 || d.업체계좌번호 ? "업체계좌" : null],
          ["은행명", d.업체은행],
          ["예금주", d.업체예금주],
          ["계좌번호", d.업체계좌번호],
        ]) as [string, React.ReactNode][]),
    ["업체비고", d.업체비고],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idp}-title`}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${idp}-title`} className="text-lg font-semibold text-zinc-900">
              입금내역 상세
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              {d.입출금 && (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    isIn ? "bg-emerald-50 text-emerald-700" : isOut ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {d.입출금}
                </span>
              )}
              <span
                className={`text-xl font-bold tabular-nums ${isIn ? "text-emerald-700" : isOut ? "text-red-600" : "text-zinc-900"}`}
              >
                {d.amount !== null ? `${formatMoney(d.amount)}원` : (d.입금액 ?? "-")}
              </span>
              {waiting && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">{waiting} 승인대기</span>
              )}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="닫기"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <dl className="flex-1 divide-y divide-zinc-100 overflow-y-auto px-5 py-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[6rem_1fr] gap-3 py-2">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="min-w-0 whitespace-pre-line break-words text-zinc-900">
                {value === null || value === undefined || value === "" ? <span className="text-zinc-300">-</span> : value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

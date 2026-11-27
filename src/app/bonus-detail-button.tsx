"use client";

import { useState, useTransition } from "react";

import { SettlementDetailSections } from "@/app/(menu)/settlement/settlement-view";
import { getBonusDetailAction, type BonusDetail } from "@/app/payroll-actions";
import { formatWon } from "@/lib/payroll-shared";

/**
 * 급여명세서의 '성과급' 칸. 누르면 성과급으로 쓴 확정 정산정보의 정산 상세를 창으로 보여준다.
 * userId가 없으면 본인 명세서(나의정보), 있으면 관리자가 보는 그 직원의 명세서
 */
export function BonusDetailButton({ month, userId = null }: { month: string; userId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<BonusDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function show() {
    setOpen(true);
    if (detail) return;
    setError(null);
    startTransition(async () => {
      const res = await getBonusDetailAction(month, userId);
      if (res.ok) setDetail(res.data);
      else setError(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="text-left text-blue-700 underline underline-offset-2 hover:text-blue-900 print:text-zinc-900 print:no-underline"
        title="정산금액 계산 상세 보기"
      >
        성과급<span className="ml-1 text-xs print:hidden">(상세)</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-2 sm:p-4 print:hidden"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="성과급 정산 상세"
            className="flex max-h-[92dvh] w-full max-w-7xl flex-col rounded-xl bg-zinc-50 text-sm shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 rounded-t-xl">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">성과급 정산 상세</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {detail
                    ? `${detail.영업사원} · ${detail.정산월} 확정 정산금 ${formatWon(detail.정산금)}원`
                    : "명세서 귀속월 한 달 전 정산월의 확정 정산정보"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                autoFocus
                className="shrink-0 rounded-md px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-100"
              >
                닫기
              </button>
            </div>
            <div className="space-y-4 overflow-auto p-4 sm:p-5">
              {pending && <p className="text-zinc-500">정산 상세를 불러오는 중…</p>}
              {error && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                  {error}
                </p>
              )}
              {detail &&
                (detail.result ? (
                  <SettlementDetailSections result={detail.result} summary={detail.summary} rates={detail.rates} />
                ) : (
                  <p className="text-zinc-500">
                    예전에 저장한 정산이라 상세 내역이 없습니다. 정산금 {formatWon(detail.정산금)}원
                  </p>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

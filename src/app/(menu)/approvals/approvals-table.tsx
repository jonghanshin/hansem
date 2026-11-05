"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { approveRequestAction, rejectRequestAction } from "@/app/actions";
import type { PendingRequest, RequestKind } from "@/lib/approvals";
import { DEPOSIT_COLUMNS, type DepositRow } from "@/lib/deposits";
import { formatMoney } from "@/lib/sites";

const KIND_STYLE: Record<RequestKind, string> = {
  등록: "bg-blue-50 text-blue-700",
  수정: "bg-amber-50 text-amber-800",
  삭제: "bg-red-50 text-red-700",
};

const KIND_RESULT: Record<RequestKind, string> = {
  등록: "입금내역에 입력",
  수정: "입금내역을 수정",
  삭제: "입금내역을 삭제",
};

/** 표시 순서 */
const FIELDS: (typeof DEPOSIT_COLUMNS)[number][] = [
  "날짜",
  "현장번호",
  "고객명",
  "영업사원",
  "입출금",
  "입금액",
  "입금구분",
  "입금자",
  "입금처",
  "입금내용",
  "계약가",
  "현금영수증",
  "비고",
];

function summary(d: DepositRow & { amount: number | null }) {
  return `${d.고객명 ?? d.현장번호 ?? ""} · ${d.입출금 ?? ""} ${d.amount !== null ? formatMoney(d.amount) : (d.입금액 ?? "")}원`;
}

/**
 * 승인 대기 요청 카드 목록.
 * mode="approve": CEO·관리자의 승인 화면 (승인/반려 버튼)
 * mode="mine": RD의 '내 요청' 화면 (보기 전용)
 */
export function ApprovalsTable({ rows, mode = "approve" }: { rows: PendingRequest[]; mode?: "approve" | "mine" }) {
  const mine = mode === "mine";
  const [busy, setBusy] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function run(r: PendingRequest, action: "approve" | "reject") {
    const label = summary(r);
    const question =
      action === "approve"
        ? `[${r.요청구분}] ${label}\n\n승인하면 ${KIND_RESULT[r.요청구분]}합니다. 승인하시겠습니까?`
        : `[${r.요청구분}] ${label}\n\n이 요청을 반려하시겠습니까? (입금내역은 바뀌지 않습니다)`;
    if (!window.confirm(question)) return;
    setBusy({ id: r.id, action });
    setError(null);
    startTransition(async () => {
      const res = action === "approve" ? await approveRequestAction(r.id) : await rejectRequestAction(r.id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 서버에서 refresh()로 목록·건수가 다시 그려진다
      setToast(`[${r.요청구분}] ${label} ${action === "approve" ? "승인" : "반려"}했습니다`);
    });
  }

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900">
          {mine ? "내 승인 요청" : "입금 승인"}{" "}
          <span className="ml-1 text-sm font-normal text-zinc-500">대기 {rows.length}건</span>
        </h1>
        <p className="text-sm text-zinc-500">
          {mine
            ? "내가 요청한 입금 등록·수정·삭제 중 아직 승인되지 않은 내역입니다. 승인되면 입금내역에 반영됩니다."
            : "등록·수정·삭제 요청을 승인하면 입금내역에 반영됩니다."}
        </p>
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-3 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">
          {error}
        </p>
      )}

      <div className="flex-1 lg:min-h-0 lg:overflow-auto">
        <ul className="mx-auto w-full max-w-4xl space-y-3 p-4 sm:p-6">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${KIND_STYLE[r.요청구분] ?? KIND_STYLE.등록}`}>
                  {r.요청구분}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">{summary(r)}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {r.요청자이름 ?? "알 수 없음"} · {r.요청일시표시}
                </span>
              </div>

              <div className="px-4 py-3">
                {r.요청구분 === "수정" ? <ChangeList r={r} /> : <FieldList d={r} strike={r.요청구분 === "삭제"} />}
                {r.요청구분 !== "등록" && !r.original && (
                  <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
                    {mine
                      ? "대상 입금내역이 이미 삭제되어 반영할 수 없는 요청입니다."
                      : "대상 입금내역이 이미 삭제되어 반영할 수 없습니다. 반려해 주세요."}
                  </p>
                )}
              </div>

              {mine ? (
                <div className="border-t border-zinc-100 px-4 py-2.5 text-right text-xs font-semibold text-amber-700">
                  승인 대기 중
                </div>
              ) : (
                <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => run(r, "reject")}
                    disabled={pending}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    {busy?.id === r.id && busy.action === "reject" ? "반려 중…" : "반려"}
                  </button>
                  <button
                    type="button"
                    onClick={() => run(r, "approve")}
                    disabled={pending || (r.요청구분 !== "등록" && !r.original)}
                    className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {busy?.id === r.id && busy.action === "approve" ? "승인 중…" : "승인"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {rows.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-zinc-500">
            <p>{mine ? "승인을 기다리는 내 요청이 없습니다." : "승인 대기 중인 요청이 없습니다."}</p>
            <Link href="/deposits" className="mt-3 inline-block font-medium text-blue-600 hover:underline">
              입금내역 보기 →
            </Link>
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** 등록·삭제 요청: 내용 전체 (삭제는 취소선) */
function FieldList({ d, strike }: { d: DepositRow; strike: boolean }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
      {FIELDS.filter((f) => d[f]).map((f) => (
        <div key={f} className="contents">
          <dt className="text-zinc-500">{f}</dt>
          <dd className={`min-w-0 break-words text-zinc-900 ${strike ? "text-zinc-500 line-through" : ""}`}>{d[f]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 수정 요청: 바뀌는 항목만 이전 → 이후 */
function ChangeList({ r }: { r: PendingRequest }) {
  const before = r.original;
  if (!before) return <FieldList d={r} strike={false} />;
  const changed = FIELDS.filter((f) => (before[f] ?? null) !== (r[f] ?? null));
  return (
    <div>
      <p className="mb-1.5 text-xs text-zinc-500">
        {before.dateIso ?? before.날짜} · {before.현장번호} · {before.고객명}
      </p>
      <dl className="space-y-1 text-sm">
        {changed.map((f) => (
          <div key={f} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="w-20 shrink-0 text-zinc-500">{f}</dt>
            <dd className="min-w-0 break-words">
              <span className="text-zinc-500 line-through">{before[f] || "(없음)"}</span>
              <span className="mx-1.5 text-zinc-400">→</span>
              <span className="font-semibold text-zinc-900">{r[f] || "(없음)"}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

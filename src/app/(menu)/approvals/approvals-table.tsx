"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";

import { DepositFormDialog } from "@/app/(menu)/deposits/deposit-form-dialog";
import {
  approveRequestAction,
  cancelPendingRequestAction,
  deleteRejectedRequestAction,
  rejectRequestAction,
  resubmitRequestAction,
} from "@/app/actions";
import type { PendingRequest, RequestKind } from "@/lib/approvals";
import { DEPOSIT_COLUMNS, vendorInfoAllowed, type DepositRow } from "@/lib/deposits";
import { formatMoney, type SiteSummary } from "@/lib/sites";

const REJECTED = "반려";

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
  "부가세포함",
  "비고",
  "A/S",
  // 거래처·계좌 정보: 출금일 때만 보인다 (업체계좌·대체계좌 중 저장된 쪽만 값이 있어 그쪽만 보인다)
  "업체",
  "업체은행",
  "업체예금주",
  "업체계좌번호",
  "대체계좌 은행",
  "대체계좌 예금주",
  "대체계좌 번호",
];

/** 컬럼명과 다르게 보여줄 이름 */
const FIELD_LABELS: Partial<Record<(typeof DEPOSIT_COLUMNS)[number], string>> = {
  현금영수증: "영수증",
  업체은행: "업체계좌 은행",
  업체예금주: "업체계좌 예금주",
  업체계좌번호: "업체계좌 번호",
};
const fieldLabel = (f: (typeof DEPOSIT_COLUMNS)[number]) => FIELD_LABELS[f] ?? f;
/**
 * 이 요청에서 보여줄 칸: 거래처 정보(업체·계좌)는 출금일 때만 (입금 등록 화면과 같은 기준, vendorInfoAllowed)
 */
const visibleFields = (d: Pick<DepositRow, "입출금">) =>
  vendorInfoAllowed(d.입출금) ? FIELDS : FIELDS.filter((f) => f !== "업체" && !ACCOUNT_FIELDS.has(f));

/** 계좌 칸인지 (강조 표시용, 출금일 때만 표시) */
const ACCOUNT_FIELDS: ReadonlySet<string> = new Set([
  "업체은행",
  "업체예금주",
  "업체계좌번호",
  "대체계좌 은행",
  "대체계좌 예금주",
  "대체계좌 번호",
]);

function summary(d: DepositRow & { amount: number | null }) {
  return `${d.고객명 ?? d.현장번호 ?? ""} · ${d.입출금 ?? ""} ${d.amount !== null ? formatMoney(d.amount) : (d.입금액 ?? "")}원`;
}

/**
 * 승인 대기 요청 카드 목록.
 * mode="approve": CEO·관리자의 승인 화면 (승인/반려 버튼)
 * mode="mine": RD의 '내 요청' 화면 (승인 대기는 취소 가능, 반려 건은 관리자 의견을 보고 고쳐 다시 요청)
 */
export function ApprovalsTable({
  rows,
  mode = "approve",
  sites = [],
  loginName = null,
  fixedSalesName = null,
  canDelete = false,
}: {
  rows: PendingRequest[];
  mode?: "approve" | "mine";
  /** mode="mine": 반려 건 재요청 화면의 현장번호 선택용 */
  sites?: SiteSummary[];
  loginName?: string | null;
  fixedSalesName?: string | null;
  /** 삭제 요청을 다시 올릴 수 있는지 (CEO·관리자만) */
  canDelete?: boolean;
}) {
  const mine = mode === "mine";
  const pendingRows = rows.filter((r) => r.승인여부 !== REJECTED);
  const rejectedRows = rows.filter((r) => r.승인여부 === REJECTED);
  const [rejecting, setRejecting] = useState<PendingRequest | null>(null);
  const [resubmitting, setResubmitting] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState<{
    id: number;
    action: "approve" | "resubmit" | "delete" | "cancel";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function approve(r: PendingRequest) {
    const label = summary(r);
    if (
      !window.confirm(
        `[${r.요청구분}] ${label}\n\n승인하면 ${KIND_RESULT[r.요청구분]}합니다. 승인하시겠습니까?`,
      )
    )
      return;
    setBusy({ id: r.id, action: "approve" });
    setError(null);
    startTransition(async () => {
      const res = await approveRequestAction(r.id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 서버에서 refresh()로 목록·건수가 다시 그려진다
      setToast(`[${r.요청구분}] ${label} 승인했습니다`);
    });
  }

  /** 다시 요청하지 않을 반려 건을 목록에서 지운다 */
  function removeRejected(r: PendingRequest) {
    const label = summary(r);
    if (
      !window.confirm(
        `[${r.요청구분}] ${label}\n\n이 반려 건을 삭제하시겠습니까? (입금내역은 바뀌지 않으며, 되돌릴 수 없습니다)`,
      )
    )
      return;
    setBusy({ id: r.id, action: "delete" });
    setError(null);
    startTransition(async () => {
      const res = await deleteRejectedRequestAction(r.id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(`[${r.요청구분}] ${label} 반려 건을 삭제했습니다`);
    });
  }

  /** 아직 승인되지 않은 내 요청을 취소한다 (요청을 삭제) */
  function cancelPending(r: PendingRequest) {
    const label = summary(r);
    if (
      !window.confirm(
        `[${r.요청구분}] ${label}\n\n이 승인 요청을 취소하고 삭제하시겠습니까? (되돌릴 수 없습니다)`,
      )
    )
      return;
    setBusy({ id: r.id, action: "cancel" });
    setError(null);
    startTransition(async () => {
      const res = await cancelPendingRequestAction(r.id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(`[${r.요청구분}] ${label} 승인 요청을 취소했습니다`);
    });
  }

  /** 삭제 요청 반려 건: 고칠 내용이 없으므로 그대로 다시 요청 */
  function resubmitDelete(r: PendingRequest) {
    const label = summary(r);
    if (
      !window.confirm(
        `[삭제] ${label}\n\n이 삭제 요청을 다시 승인 요청하시겠습니까?`,
      )
    )
      return;
    setBusy({ id: r.id, action: "resubmit" });
    setError(null);
    startTransition(async () => {
      const res = await resubmitRequestAction(r.id, null);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(`[삭제] ${label} 다시 승인 요청했습니다`);
    });
  }

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900">
          {mine ? "내 승인 요청" : "입금 승인"}{" "}
          <span className="ml-1 text-sm font-normal text-zinc-500">
            대기 {pendingRows.length}건
            {mine &&
              rejectedRows.length > 0 &&
              ` · 반려 ${rejectedRows.length}건`}
          </span>
        </h1>
        <p className="text-sm text-zinc-500">
          {mine
            ? "내가 요청한 입금 등록·수정·삭제 중 승인 대기·반려된 내역입니다. 반려된 건은 관리자 의견을 보고 고쳐 다시 요청할 수 있습니다."
            : "등록·수정·삭제 요청을 승인하면 입금내역에 반영됩니다."}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mx-4 mt-3 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6"
        >
          {error}
        </p>
      )}

      <div className="flex-1 lg:min-h-0 lg:overflow-auto">
        <ul className="mx-auto w-full max-w-4xl space-y-3 p-4 sm:p-6">
          {[...rejectedRows, ...pendingRows].map((r) => (
            <li
              key={r.id}
              className={`rounded-xl border bg-white shadow-sm ${r.승인여부 === REJECTED ? "border-red-300" : "border-zinc-200"}`}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${KIND_STYLE[r.요청구분] ?? KIND_STYLE.등록}`}
                >
                  {r.요청구분}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                  {summary(r)}
                </span>
                <span className="ml-auto text-xs text-zinc-500">
                  {r.요청자이름 ?? "알 수 없음"} · {r.요청일시표시}
                </span>
              </div>

              <div className="px-4 py-3">
                {r.요청구분 === "수정" ? (
                  <ChangeList r={r} />
                ) : (
                  <FieldList d={r} strike={r.요청구분 === "삭제"} />
                )}
                {r.관리자의견 && (
                  <div
                    className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                      r.승인여부 === REJECTED
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700"
                    }`}
                  >
                    <p className="text-xs font-semibold">
                      {r.승인여부 === REJECTED
                        ? "관리자 의견 (반려 사유)"
                        : "이전 반려 의견 (수정 후 재요청된 건)"}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line">{r.관리자의견}</p>
                  </div>
                )}
                {r.요청구분 !== "등록" && !r.original && (
                  <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
                    {mine
                      ? "대상 입금내역이 이미 삭제되어 반영할 수 없는 요청입니다."
                      : "대상 입금내역이 이미 삭제되어 반영할 수 없습니다. 반려해 주세요."}
                  </p>
                )}
              </div>

              {mine && r.승인여부 === REJECTED ? (
                <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-4 py-2.5">
                  <span className="mr-auto text-xs font-semibold text-red-600">
                    반려됨
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRejected(r)}
                    disabled={pending}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  >
                    {busy?.id === r.id && busy.action === "delete"
                      ? "삭제 중…"
                      : "삭제"}
                  </button>
                  {(r.요청구분 !== "삭제" || canDelete) && (
                    <button
                      type="button"
                      onClick={() =>
                        r.요청구분 === "삭제"
                          ? resubmitDelete(r)
                          : setResubmitting(r)
                      }
                      disabled={
                        pending || (r.요청구분 !== "등록" && !r.original)
                      }
                      className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy?.id === r.id && busy.action === "resubmit"
                        ? "요청 중…"
                        : r.요청구분 === "삭제"
                          ? "다시 요청"
                          : "수정 후 다시 요청"}
                    </button>
                  )}
                </div>
              ) : mine ? (
                <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-4 py-2.5">
                  <span className="mr-auto text-xs font-semibold text-amber-700">승인 대기 중</span>
                  <button
                    type="button"
                    onClick={() => cancelPending(r)}
                    disabled={pending}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  >
                    {busy?.id === r.id && busy.action === "cancel" ? "취소 중…" : "승인취소요청"}
                  </button>
                </div>
              ) : (
                <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setRejecting(r)}
                    disabled={pending}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    반려
                  </button>
                  <button
                    type="button"
                    onClick={() => approve(r)}
                    disabled={pending || (r.요청구분 !== "등록" && !r.original)}
                    className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {busy?.id === r.id && busy.action === "approve"
                      ? "승인 중…"
                      : "승인"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {rows.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-zinc-500">
            <p>
              {mine
                ? "승인 대기·반려된 내 요청이 없습니다."
                : "승인 대기 중인 요청이 없습니다."}
            </p>
            <Link
              href="/deposits"
              className="mt-3 inline-block font-medium text-blue-600 hover:underline"
            >
              입금내역 보기 →
            </Link>
          </div>
        )}
      </div>

      {rejecting && (
        <RejectDialog
          request={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setToast(
              `[${rejecting.요청구분}] ${summary(rejecting)} 반려했습니다`,
            );
            setRejecting(null);
          }}
        />
      )}

      {resubmitting && (
        <DepositFormDialog
          key={resubmitting.id}
          sites={sites}
          loginName={loginName}
          fixedSalesName={fixedSalesName}
          editing={resubmitting}
          resubmit={{
            requestId: resubmitting.id,
            kind: resubmitting.요청구분,
            comment: resubmitting.관리자의견,
          }}
          onClose={() => setResubmitting(null)}
          onDone={(message) => {
            setResubmitting(null);
            setToast(message);
          }}
        />
      )}

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

/** 반려 의견 입력 → 승인필요입금내역.관리자의견에 저장 */
function RejectDialog({
  request,
  onClose,
  onDone,
}: {
  request: PendingRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const idp = useId();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) {
      setError("반려 의견을 입력해 주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await rejectRequestAction(request.id, comment);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idp}-title`}
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2
            id={`${idp}-title`}
            className="text-lg font-semibold text-zinc-900"
          >
            반려
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600">
            [{request.요청구분}] {summary(request)}
            <span className="block text-xs text-zinc-500">
              요청자 {request.요청자이름 ?? "알 수 없음"} · 입금내역은 바뀌지
              않습니다
            </span>
          </p>
        </div>
        <div className="px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-700">
              반려 의견<span className="ml-0.5 text-red-600">*</span>
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={500}
              required
              autoFocus
              placeholder="요청자가 무엇을 고쳐야 하는지 적어 주세요"
              className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {pending ? "반려 중…" : "반려"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 등록·삭제 요청: 내용 전체 (삭제는 취소선) */
function FieldList({ d, strike }: { d: DepositRow; strike: boolean }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
      {visibleFields(d).filter((f) => d[f]).map((f) => (
        <div key={f} className="contents">
          <dt className={ACCOUNT_FIELDS.has(f) ? "font-medium text-blue-700" : "text-zinc-500"}>{fieldLabel(f)}</dt>
          <dd
            className={`min-w-0 break-words ${ACCOUNT_FIELDS.has(f) ? "font-semibold tabular-nums" : ""} ${
              strike ? "text-zinc-500 line-through" : "text-zinc-900"
            }`}
          >
            {d[f]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 수정 요청: 바뀌는 항목만 이전 → 이후 */
function ChangeList({ r }: { r: PendingRequest }) {
  const before = r.original;
  if (!before) return <FieldList d={r} strike={false} />;
  // 거래처 정보(업체·계좌)는 수정 후(또는 수정 전) 출금인 경우에만 보여준다
  const fields = vendorInfoAllowed(r.입출금) || vendorInfoAllowed(before.입출금) ? FIELDS : visibleFields(r);
  const changed = fields.filter((f) => (before[f] ?? null) !== (r[f] ?? null));
  return (
    <div>
      <p className="mb-1.5 text-xs text-zinc-500">
        {before.dateIso ?? before.날짜} · {before.현장번호} · {before.고객명}
      </p>
      <dl className="space-y-1 text-sm">
        {changed.map((f) => (
          <div key={f} className="flex flex-wrap items-baseline gap-x-2">
            <dt className={`w-28 shrink-0 ${ACCOUNT_FIELDS.has(f) ? "font-medium text-blue-700" : "text-zinc-500"}`}>{fieldLabel(f)}</dt>
            <dd className="min-w-0 break-words">
              <span className="text-zinc-500 line-through">
                {before[f] || "(없음)"}
              </span>
              <span className="mx-1.5 text-zinc-400">→</span>
              <span className="font-semibold text-zinc-900">
                {r[f] || "(없음)"}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

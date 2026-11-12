"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { convertConsultToSiteAction } from "@/app/consult-actions";
import { formatYearMonth, type Consult } from "@/lib/consult-shared";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** 상담노트 머리의 현장 연결: 전환된 상담은 현장정보로 가는 링크, 아니면 '현장으로 전환' 버튼 */
export function SiteLink({
  consult: c,
  today,
  dirty,
  onWarning,
}: {
  consult: Consult;
  today: string;
  dirty: boolean;
  onWarning: (w: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (c.현장번호) {
    return (
      <Link
        href={`/sites?site=${encodeURIComponent(c.현장번호)}`}
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
        title="현장정보에서 보기"
      >
        현장 {c.현장번호} →
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        현장으로 전환
      </button>
      {open && <ConvertDialog consult={c} today={today} dirty={dirty} onWarning={onWarning} onClose={() => setOpen(false)} />}
    </>
  );
}

function ConvertDialog({
  consult: c,
  today,
  dirty,
  onWarning,
  onClose,
}: {
  consult: Consult;
  today: string;
  dirty: boolean;
  onWarning: (w: string | null) => void;
  onClose: () => void;
}) {
  const idp = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => inputRef.current?.focus(), []);

  const works = c.공사항목.filter((w) => w.항목 && w.우선순위 !== "제외" && w.견적반영 !== "제외").map((w) => w.항목);
  const copied: [string, string][] = [
    ["고객명", c.고객명],
    ["고객전화번호", c.연락처],
    ["영업사원", c.영업사원 ?? ""],
    ["현장주소", c.현장주소],
    ["공사시기", c.시공예정월 ? `${formatYearMonth(c.시공예정월)} 1일` : ""],
    ["공사품목", works.join(", ")],
    ["정산여부", "미정산"],
  ];

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await convertConsultToSiteAction(c.id, form);
      if (!res.ok) return setError(res.error);
      onWarning(res.data.warning);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !pending && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={`${idp}-t`} className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <form onSubmit={submit}>
          <div className="border-b border-zinc-200 px-5 py-3">
            <h2 id={`${idp}-t`} className="text-base font-semibold text-zinc-900">
              현장으로 전환
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">현장정보에 새 현장을 만들고 이 상담노트와 연결합니다. 진행 단계는 &apos;계약완료&apos;가 됩니다.</p>
          </div>
          <div className="space-y-3 px-5 py-4">
            {dirty && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                저장하지 않은 변경이 있습니다. 먼저 저장해야 바뀐 내용이 현장에 반영됩니다.
              </p>
            )}
            {!c.영업사원 && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">담당 RD를 먼저 지정하고 저장하세요.</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-700">
                  현장번호<span className="ml-0.5 text-red-500">*</span>
                </span>
                <input ref={inputRef} name="현장번호" required maxLength={50} className={INPUT} placeholder="예: 2027-015" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-700">계약일</span>
                <input type="date" name="계약일" defaultValue={today} className={INPUT} />
              </label>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="mb-1.5 text-xs font-medium text-zinc-600">상담노트에서 옮겨 담는 값</p>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-sm">
                {copied.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="min-w-0 break-words text-zinc-900">{v || <span className="text-zinc-300">-</span>}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-zinc-500">계약가 등 금액은 현장정보에서 입력하세요.</p>
            </div>
            {error && <p className="whitespace-pre-line text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
            <button type="button" onClick={onClose} disabled={pending} className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
              취소
            </button>
            <button
              type="submit"
              disabled={pending || !c.영업사원}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? "전환 중…" : "현장 만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

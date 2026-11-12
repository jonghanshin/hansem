"use client";

import { useRef, useState, useTransition } from "react";

import { addAsHistoryAction, deleteAsHistoryAction } from "@/app/as-actions";
import { AS_HISTORY_KINDS, AS_LONG_TEXT_MAX, AS_STATES, type AsHistory } from "@/lib/as-shared";
import { formatDateTime, nowLocalInput } from "@/lib/consult-shared";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const ICON: Record<string, string> = { 전화: "📞", 문자: "✉️", 방문: "🚗", 원격확인: "📷", 자재발주: "📦", 기타: "📝" };

/** 방문·처리 이력: 한 줄 기록(일시 자동) + 타임라인 */
export function AsHistoryPanel({
  caseId,
  items,
  state,
  meUid,
  canManage,
}: {
  caseId: number;
  items: AsHistory[];
  /** 지금 진행 상태 (기록하면서 바꿀 수 있다) */
  state: string;
  meUid: number;
  canManage: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [customTime, setCustomTime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!customTime || !form.get("일시")) form.set("일시", nowLocalInput()); // 시간을 고르지 않으면 지금
    setError(null);
    startTransition(async () => {
      const res = await addAsHistoryAction(caseId, form);
      if (!res.ok) return setError(res.error);
      formRef.current?.reset();
      setCustomTime(false);
    });
  }

  function remove(h: AsHistory) {
    if (!confirm("이 이력을 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAsHistoryAction(h.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={submit} className="space-y-2.5 rounded-md bg-zinc-50 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {AS_HISTORY_KINDS.map((k, i) => (
            <label
              key={k}
              className="cursor-pointer rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white"
            >
              <input type="radio" name="구분" value={k} defaultChecked={i === 0} className="sr-only" />
              {ICON[k]} {k}
            </label>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
            <input type="checkbox" checked={customTime} onChange={(e) => setCustomTime(e.target.checked)} className="size-3.5 accent-blue-600" />
            시간 지정
          </label>
        </div>
        {customTime && <input type="datetime-local" name="일시" required className={`${INPUT} sm:max-w-60`} aria-label="일시" />}
        <input name="업체" maxLength={200} placeholder="담당자·업체 (예: 장희정 → 박현도배)" className={INPUT} />
        <textarea name="내용" required rows={3} maxLength={AS_LONG_TEXT_MAX} placeholder="확인 내용 · 조치 · 사용 자재" className={INPUT} />
        <input name="결과" maxLength={200} placeholder="결과·재방문 (예: 자재 도착 대기, 해결)" className={INPUT} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-600">진행 상태 (지금: {state})</span>
            <select name="진행상태" defaultValue="" className={`${INPUT} py-1`}>
              <option value="">그대로</option>
              {AS_STATES.filter((s) => s !== state).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-zinc-700">
            <input type="checkbox" name="고객안내" className="size-4 accent-blue-600" />
            고객에게 안내함 (최근 고객안내일 갱신)
          </label>
          <button type="submit" disabled={pending} className="ml-auto rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {pending ? "기록 중…" : "기록"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">아직 처리 이력이 없습니다.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-zinc-200 pl-4">
          {items.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white bg-blue-500" aria-hidden />
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-700 tabular-nums">{formatDateTime(h.일시)}</span>
                {h.구분 && (
                  <span>
                    {ICON[h.구분] ?? ""} {h.구분}
                  </span>
                )}
                {h.업체 && <span>· {h.업체}</span>}
                <span className="text-zinc-400">· 기록 {h.작성자}</span>
                {(h.등록자 === meUid || canManage) && (
                  <button type="button" onClick={() => remove(h)} disabled={pending} className="ml-auto text-zinc-400 hover:text-red-600">
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-900">{h.내용}</p>
              {h.결과 && <p className="mt-0.5 text-sm font-medium text-blue-800">→ {h.결과}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

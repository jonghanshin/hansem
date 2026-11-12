"use client";

import { useRef, useState, useTransition } from "react";

import { addConsultRecordAction, deleteConsultRecordAction } from "@/app/consult-actions";
import {
  CONTACT_METHODS,
  CONTACT_STATES,
  formatDateTime,
  LONG_TEXT_MAX,
  nowLocalInput,
  type ConsultRecord,
} from "@/lib/consult-shared";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const METHOD_ICON: Record<string, string> = { 전화: "📞", 문자: "✉️", 카카오톡: "💬", 방문: "🤝", 기타: "📝" };

/** 연락 기록: 한 줄 빠른 입력 + 타임라인. 기록을 남기면 상담노트의 최근 연락일·연락 상태·다음 연락일도 바뀐다 */
export function ConsultRecords({
  consultId,
  records,
  meUid,
  canManage,
}: {
  consultId: number;
  records: ConsultRecord[];
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
    // 시간을 따로 고르지 않으면 지금 (기기 시간)
    if (!customTime || !form.get("기록일시")) form.set("기록일시", nowLocalInput());
    setError(null);
    startTransition(async () => {
      const res = await addConsultRecordAction(consultId, form);
      if (!res.ok) return setError(res.error);
      formRef.current?.reset();
      setCustomTime(false);
    });
  }

  function remove(r: ConsultRecord) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteConsultRecordAction(r.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={submit} className="space-y-2.5 rounded-md bg-zinc-50 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CONTACT_METHODS.map((m, i) => (
            <label
              key={m}
              className="cursor-pointer rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white"
            >
              <input type="radio" name="연락방법" value={m} defaultChecked={i === 0} className="sr-only" />
              {METHOD_ICON[m]} {m}
            </label>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
            <input type="checkbox" checked={customTime} onChange={(e) => setCustomTime(e.target.checked)} className="size-3.5 accent-blue-600" />
            시간 지정
          </label>
        </div>
        {customTime && <input type="datetime-local" name="기록일시" required className={`${INPUT} sm:max-w-60`} aria-label="기록일시" />}
        <textarea
          name="내용"
          required
          rows={3}
          maxLength={LONG_TEXT_MAX}
          placeholder="연락 결과 · 상담 내용 · 다음 할 일"
          className={INPUT}
        />
        <div className="flex flex-wrap items-end gap-2">
          <fieldset className="min-w-0">
            <legend className="mb-1 text-xs text-zinc-600">연락 결과 (연락 상태 변경)</legend>
            <div className="flex flex-wrap gap-1">
              {["", ...CONTACT_STATES.filter((s) => s !== "미연락")].map((s) => (
                <label
                  key={s || "keep"}
                  className="cursor-pointer rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 has-checked:border-zinc-900 has-checked:bg-zinc-900 has-checked:text-white"
                >
                  <input type="radio" name="연락상태" value={s} defaultChecked={s === ""} className="sr-only" />
                  {s || "그대로"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-600">다음 연락일</span>
            <input type="date" name="다음연락일" className={`${INPUT} py-1`} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="ml-auto rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "기록 중…" : "기록"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {records.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">아직 연락 기록이 없습니다.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-zinc-200 pl-4">
          {records.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white bg-blue-500" aria-hidden />
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-700 tabular-nums">{formatDateTime(r.기록일시)}</span>
                {r.연락방법 && (
                  <span>
                    {METHOD_ICON[r.연락방법] ?? ""} {r.연락방법}
                  </span>
                )}
                <span>· {r.담당자}</span>
                {(r.등록자 === meUid || canManage) && (
                  <button type="button" onClick={() => remove(r)} disabled={pending} className="ml-auto text-zinc-400 hover:text-red-600">
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-900">{r.내용}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { addSettlementOpinionAction, listSettlementOpinionsAction } from "@/app/settlement-opinion-actions";
import { OPINION_MAX_LENGTH, unansweredCount, type SettlementOpinion } from "@/lib/settlement-opinions-shared";

const TEXTAREA =
  "w-full resize-y rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
}

/** 글 입력칸 + 등록 버튼 */
function Composer({
  placeholder,
  button,
  onSubmit,
}: {
  placeholder: string;
  button: string;
  onSubmit: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!text.trim()) return setError("내용을 입력하세요");
    startTransition(async () => {
      const err = await onSubmit(text);
      if (err) setError(err);
      else setText("");
    });
  }

  return (
    <div className="space-y-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={OPINION_MAX_LENGTH}
        placeholder={placeholder}
        className={TEXTAREA}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400 tabular-nums">
          {text.length.toLocaleString()} / {OPINION_MAX_LENGTH.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? "등록 중…" : button}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 정산결과에 대한 의견 교환 (영업사원·정산월별).
 * role="rd": 의견 등록, role="admin": 각 의견에 응답.
 */
export function OpinionThread({
  영업사원,
  정산월,
  role,
  onUnansweredChange,
}: {
  영업사원: string;
  정산월: string;
  role: "rd" | "admin";
  /** 관리자 화면: 응답 대기 의견 수가 바뀌면 알려준다 (RD게시 현황 배지용) */
  onUnansweredChange?: (count: number) => void;
}) {
  const [opinions, setOpinions] = useState<SettlementOpinion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  function load() {
    setError(null);
    startLoading(async () => {
      const res = await listSettlementOpinionsAction(영업사원, 정산월);
      if (res.ok) setOpinions(res.data);
      else setError(res.error);
    });
  }

  // 처음 열 때 의견을 불러온다
  useEffect(() => {
    let cancelled = false;
    listSettlementOpinionsAction(영업사원, 정산월).then((res) => {
      if (cancelled) return;
      if (res.ok) setOpinions(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [영업사원, 정산월]);

  // 응답 대기 수는 의견 목록이 바뀔 때만 알린다 (부모가 매번 새 함수를 넘겨도 반복 호출되지 않게 ref에 둔다)
  const onUnansweredRef = useRef(onUnansweredChange);
  useEffect(() => {
    onUnansweredRef.current = onUnansweredChange;
  });
  useEffect(() => {
    if (opinions) onUnansweredRef.current?.(unansweredCount(opinions));
  }, [opinions]);

  async function add(내용: string, 부모id: number | null) {
    const res = await addSettlementOpinionAction({ 영업사원, 정산월, 내용, 부모id });
    if (!res.ok) return res.error;
    setOpinions((prev) => [...(prev ?? []), res.data]);
    return null;
  }

  const questions = (opinions ?? []).filter((o) => o.구분 === "RD" && o.부모id === null);
  const repliesOf = (id: number) => (opinions ?? []).filter((o) => o.부모id === id);
  const waiting = opinions ? unansweredCount(opinions) : 0;

  return (
    <section aria-labelledby={`opinion-${영업사원}-${정산월}`} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`opinion-${영업사원}-${정산월}`} className="text-base font-semibold text-zinc-900">
          정산 의견{" "}
          <span className="ml-1 text-sm font-normal text-zinc-500">
            {영업사원} · {정산월}
            {opinions && ` · ${questions.length}건`}
          </span>
          {waiting > 0 && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">응답 대기 {waiting}</span>
          )}
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400"
        >
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        {role === "rd"
          ? "정산결과에 대해 궁금하거나 다른 점이 있으면 의견을 남겨 주세요. 관리자가 확인 후 응답합니다. (게시 기간 동안만 볼 수 있습니다)"
          : "RD가 정산결과에 남긴 의견입니다. 각 의견 아래에서 응답할 수 있습니다."}
      </p>

      {error && (
        <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-red-700">
          {error}
        </p>
      )}

      {opinions && questions.length === 0 && (
        <p className="rounded-md bg-zinc-50 px-3 py-4 text-center text-zinc-500">
          {role === "rd" ? "아직 등록한 의견이 없습니다." : "아직 등록된 의견이 없습니다."}
        </p>
      )}

      <ul className="space-y-3">
        {questions.map((q) => {
          const replies = repliesOf(q.id);
          return (
            <li key={q.id} className="rounded-md border border-zinc-200">
              <div className="bg-zinc-50 px-3 py-2">
                <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-semibold text-white">RD 의견</span>
                  <span className="font-medium text-zinc-700">{q.작성자}</span>
                  <span>{formatTime(q.created_at)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold ${replies.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                  >
                    {replies.length ? "응답 완료" : "응답 대기"}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-line text-zinc-900">{q.내용}</p>
              </div>
              {replies.length > 0 && (
                <ul className="space-y-2 border-t border-zinc-100 px-3 py-2">
                  {replies.map((r) => (
                    <li key={r.id} className="border-l-2 border-blue-300 pl-3">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 font-semibold text-white">관리자 응답</span>
                        <span className="font-medium text-zinc-700">{r.작성자}</span>
                        <span>{formatTime(r.created_at)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-zinc-900">{r.내용}</p>
                    </li>
                  ))}
                </ul>
              )}
              {role === "admin" && (
                <div className="border-t border-zinc-100 px-3 py-2">
                  <Composer placeholder="이 의견에 대한 응답을 입력하세요" button="응답 등록" onSubmit={(text) => add(text, q.id)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {role === "rd" && <Composer placeholder="정산결과에 대한 의견을 입력하세요" button="의견 등록" onSubmit={(text) => add(text, null)} />}
    </section>
  );
}

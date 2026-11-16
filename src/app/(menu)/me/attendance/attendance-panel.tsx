"use client";

import { useState, useTransition } from "react";

import { deleteAttendanceAction, recordAttendanceAction } from "@/app/attendance-actions";
import {
  formatClock,
  PLACE_MEMO_MAX,
  PLACE_OPTIONS,
  type AttendanceKind,
  type AttendanceRecord,
  type MySiteOption,
  type PlaceType,
} from "@/lib/attendance-shared";

/** 근태관리: 출근/퇴근 → 장소 선택 (현장이면 내 진행 중 현장, 기타면 직접 입력) → 기록 */
export function AttendancePanel({
  records,
  sites,
  today,
  tomorrow,
}: {
  records: AttendanceRecord[];
  sites: MySiteOption[];
  today: string;
  tomorrow: string;
}) {
  const [kind, setKind] = useState<AttendanceKind | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const todays = records.filter((r) => r.근무일 === today);
  const lastIn = todays.find((r) => r.구분 === "출근");
  const lastOut = todays.find((r) => r.구분 === "퇴근");
  // 오늘 출근 예정지(어제 퇴근할 때 정한 것)와 내일 출근 예정지
  const planToday = todays.find((r) => r.구분 === "출근예정");
  const planTomorrow = records.find((r) => r.구분 === "출근예정" && r.근무일 === tomorrow);

  return (
    <div className="space-y-5">
      {/* 오늘 현황 */}
      <section className={CARD}>
        <h2 className={CARD_TITLE}>오늘 ({today})</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Today label="출근" record={lastIn} hint={!lastIn && planToday ? `예정: ${planToday.장소}` : undefined} />
          <Today label="퇴근" record={lastOut} />
          <Today label={`내일 출근 예정 (${tomorrow.slice(5)})`} record={planTomorrow} placeOnly />
        </div>
      </section>

      {/* 출근 / 퇴근 */}
      <section className={CARD}>
        {kind === null ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setKind("출근");
              }}
              className="rounded-xl bg-blue-600 py-6 text-lg font-bold text-white shadow-sm hover:bg-blue-700"
            >
              출근
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setKind("퇴근");
              }}
              className="rounded-xl bg-zinc-800 py-6 text-lg font-bold text-white shadow-sm hover:bg-zinc-900"
            >
              퇴근
            </button>
          </div>
        ) : (
          <PlaceForm
            kind={kind}
            sites={sites}
            onCancel={() => setKind(null)}
            onDone={(r) => {
              setKind(null);
              setMessage({ tone: "ok", text: `${r.구분} 기록됨 · ${r.장소} · ${formatClock(r.기록일시)}` });
            }}
          />
        )}
        {message && (
          <p
            role={message.tone === "ok" ? "status" : "alert"}
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </p>
        )}
      </section>

      {/* 최근 기록 */}
      <section className={CARD}>
        <h2 className={CARD_TITLE}>최근 기록</h2>
        {records.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead className="border-b border-zinc-200 text-xs text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">날짜</th>
                  <th className="px-2 py-1.5 text-left font-medium">시간</th>
                  <th className="px-2 py-1.5 text-left font-medium">구분</th>
                  <th className="px-2 py-1.5 text-left font-medium">장소</th>
                  <th className="px-2 py-1.5 text-right font-medium">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5 text-zinc-500 tabular-nums">{r.근무일}</td>
                    <td className="px-2 py-1.5 text-zinc-900 tabular-nums">{formatClock(r.기록일시)}</td>
                    <td
                      className={`px-2 py-1.5 font-medium ${
                        r.구분 === "출근" ? "text-blue-700" : r.구분 === "출근예정" ? "text-amber-700" : "text-zinc-700"
                      }`}
                    >
                      {r.구분}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-900">
                      {r.장소구분 !== r.장소 && r.장소구분 !== "기타" && (
                        <span className="mr-1 text-xs text-zinc-400">{r.장소구분}</span>
                      )}
                      {r.장소}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <DeleteButton record={r} onError={(text) => setMessage({ tone: "error", text })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DeleteButton({ record, onError }: { record: AttendanceRecord; onError: (text: string) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const ok = window.confirm(
          `${record.근무일} ${formatClock(record.기록일시)} ${record.구분} (${record.장소}) 기록을 삭제할까요?`,
        );
        if (!ok) return;
        startTransition(async () => {
          const res = await deleteAttendanceAction(record.id);
          if (!res.ok) onError(res.error);
        });
      }}
      className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      {pending ? "삭제 중…" : "삭제"}
    </button>
  );
}

function Today({
  label,
  record,
  hint,
  placeOnly,
}: {
  label: string;
  record?: AttendanceRecord;
  hint?: string;
  /** 시각 대신 장소를 크게 보여 준다 (출근 예정지) */
  placeOnly?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold text-zinc-900 tabular-nums">
        {!record ? "-" : placeOnly ? record.장소 : formatClock(record.기록일시)}
      </p>
      {record && !placeOnly && <p className="mt-0.5 truncate text-xs text-zinc-500">{record.장소}</p>}
      {hint && <p className="mt-0.5 truncate text-xs text-amber-700">{hint}</p>}
    </div>
  );
}

function PlaceForm({
  kind,
  sites,
  onCancel,
  onDone,
}: {
  kind: AttendanceKind;
  sites: MySiteOption[];
  onCancel: () => void;
  onDone: (r: AttendanceRecord) => void;
}) {
  const [placeType, setPlaceType] = useState<PlaceType | null>(null);
  const [siteNumber, setSiteNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 버튼 문구: 출근예정은 출근과 같은 선택지 (죽전사무실 출근, 현장출근 …)
  const verb = kind === "퇴근" ? "퇴근" : "출근";

  function submit(type: PlaceType) {
    setError(null);
    startTransition(async () => {
      const res = await recordAttendanceAction({ kind, placeType: type, siteNumber, memo });
      if (res.ok) onDone(res.data);
      else setError(res.error);
    });
  }

  function choose(type: PlaceType) {
    setPlaceType(type);
    setError(null);
    // 사무실·스타필드는 고르는 즉시 기록
    if (type !== "현장" && type !== "기타") submit(type);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">
          {kind === "출근예정" ? "내일 출근 예정지 선택" : `${kind} 장소 선택`}
        </h2>
        <button type="button" onClick={onCancel} disabled={pending} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
          취소
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLACE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            onClick={() => choose(o.value)}
            className={`rounded-lg border px-3 py-3 text-sm font-semibold disabled:opacity-60 ${
              placeType === o.value
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-zinc-300 bg-white text-zinc-800 hover:border-blue-400"
            }`}
          >
            {o.value === "기타" ? "기타" : o.value === "현장" ? `현장${verb}` : `${o.label} ${verb}`}
          </button>
        ))}
      </div>

      {placeType === "현장" &&
        (sites.length === 0 ? (
          <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">진행 중인 내 현장이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={siteNumber}
              onChange={(e) => setSiteNumber(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900"
            >
              <option value="">현장을 선택하세요</option>
              {sites.map((s) => (
                <option key={s.현장번호} value={s.현장번호}>
                  {s.현장번호} {s.고객명 ?? ""} {s.현장주소 ? `· ${s.현장주소}` : ""}
                </option>
              ))}
            </select>
            <SubmitButton disabled={pending || !siteNumber} pending={pending} kind={kind} onClick={() => submit("현장")} />
          </div>
        ))}

      {placeType === "기타" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={PLACE_MEMO_MAX}
            placeholder="장소를 입력하세요"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && memo.trim() && !pending) submit("기타");
            }}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <SubmitButton disabled={pending || !memo.trim()} pending={pending} kind={kind} onClick={() => submit("기타")} />
        </div>
      )}

      {pending && placeType !== "현장" && placeType !== "기타" && <p className="text-sm text-zinc-500">기록 중…</p>}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {kind === "퇴근" && <TomorrowPlan sites={sites} disabled={pending} />}
    </div>
  );
}

/** 퇴근 화면: 내일 출근 예정지 (출근과 같은 선택지, 퇴근 기록과 따로 저장) */
function TomorrowPlan({ sites, disabled }: { sites: MySiteOption[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <div className="border-t border-zinc-200 pt-3">
      {open ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <PlaceForm
            kind="출근예정"
            sites={sites}
            onCancel={() => setOpen(false)}
            onDone={(r) => {
              setOpen(false);
              setSaved(`내일(${r.근무일}) 출근 예정지 저장됨 · ${r.장소}`);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setSaved(null);
            setOpen(true);
          }}
          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        >
          내일 출근 예정지
        </button>
      )}
      {saved && (
        <p role="status" className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {saved}
        </p>
      )}
    </div>
  );
}

function SubmitButton({
  disabled,
  pending,
  kind,
  onClick,
}: {
  disabled: boolean;
  pending: boolean;
  kind: AttendanceKind;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "기록 중…" : kind === "출근예정" ? "예정지 저장" : `${kind} 기록`}
    </button>
  );
}

const CARD = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5";
const CARD_TITLE = "mb-3 text-sm font-semibold text-zinc-900";

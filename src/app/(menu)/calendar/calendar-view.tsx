"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createEventAction, deleteEventAction, updateEventAction } from "@/app/calendar-actions";
import {
  compareEvents,
  EVENT_COLORS,
  EVENT_KIND_PERSONAL,
  EVENT_KIND_SHARED,
  eventOnDate,
  EVENT_MEMO_MAX,
  EVENT_TITLE_MAX,
  formatEventPeriod,
  isEventColor,
  MAX_SELECTED_MEMBERS,
  memberColors,
  monthWeeks,
  MY_COLOR,
  shiftMonth,
  TEAM_CATEGORIES,
  TEAM_CATEGORY_DEFAULT,
  TEAM_CATEGORY_KEYS,
  teamCategoryOf,
  WEEKDAYS,
  type TeamCategory,
  type CalendarEvent,
  type CalendarMember,
  type MemberColor,
} from "@/lib/calendar-shared";

/** 한 칸에 바로 보여 줄 일정 수. 넘치면 "+N개"로 하루 목록을 연다 */
const MAX_PER_CELL = 3;
/** 이 시간 안에 같은 날짜를 다시 누르면 두 번 탭으로 본다 */
const DOUBLE_TAP_MS = 280;

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-100 disabled:text-zinc-400";
const BUTTON = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100";

type DialogState =
  | { kind: "new"; date: string }
  | { kind: "event"; event: CalendarEvent }
  | { kind: "day"; date: string }
  | null;

type Props = {
  ym: string;
  today: string;
  me: CalendarMember;
  members: CalendarMember[];
  selectedIds: number[];
  events: CalendarEvent[];
};

export function CalendarView({ ym, today, me, members, selectedIds, events }: Props) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);

  // 날짜 칸 한 번 클릭 → 그날 전체 일정 목록, 두 번 클릭(더블클릭) → 수정 (일정 위면 그 일정, 빈 곳이면 새 일정).
  // 모바일 브라우저는 dblclick 이벤트가 잘 오지 않아 클릭 간격으로 직접 판단한다.
  // 한 번만 누르면 두 번째 클릭을 잠깐 기다렸다가 목록을 연다.
  const pendingTap = useRef<{ date: string; timer: number } | null>(null);
  useEffect(() => () => window.clearTimeout(pendingTap.current?.timer), []);
  const tapDay = (date: string, onDoubleTap: () => void) => {
    const prev = pendingTap.current;
    if (prev) window.clearTimeout(prev.timer);
    if (prev?.date === date) {
      pendingTap.current = null;
      onDoubleTap();
      return;
    }
    const onSingleTap = () => setDialog({ kind: "day", date });
    pendingTap.current = {
      date,
      timer: window.setTimeout(() => {
        pendingTap.current = null;
        onSingleTap();
      }, DOUBLE_TAP_MS),
    };
  };

  const colors = useMemo(() => memberColors(me.id, members), [me.id, members]);
  const names = useMemo(() => new Map([...members.map((m) => [m.id, m.name] as const), [me.id, me.name]]), [members, me]);
  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  const sorted = useMemo(() => [...events].sort(compareEvents), [events]);
  const othersShown = selectedIds.length > 0;

  const go = (nextYm: string, ids: number[]) => {
    const params = new URLSearchParams();
    if (nextYm !== today.slice(0, 7)) params.set("ym", nextYm);
    if (ids.length) params.set("users", ids.join(","));
    const s = params.toString();
    startNavigation(() => router.push(s ? `/calendar?${s}` : "/calendar"));
  };

  const [year, month] = ym.split("-").map(Number);
  const colorOf = (id: number) => colors.get(id) ?? MY_COLOR;
  const nameOf = (id: number) => names.get(id) ?? "(알 수 없음)";
  const eventColor = (e: CalendarEvent) =>
    e.shared ? TEAM_CATEGORIES[teamCategoryOf(e)] : isEventColor(e.color) ? EVENT_COLORS[e.color] : colorOf(e.ownerId);

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900">팀 캘린더</h1>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(shiftMonth(ym, -1), selectedIds)} className={BUTTON} aria-label="이전 달">
            ‹
          </button>
          <span className="min-w-28 text-center text-base font-semibold text-zinc-900 tabular-nums">
            {year}년 {month}월
          </span>
          <button type="button" onClick={() => go(shiftMonth(ym, 1), selectedIds)} className={BUTTON} aria-label="다음 달">
            ›
          </button>
          <button type="button" onClick={() => go(today.slice(0, 7), selectedIds)} className={`${BUTTON} ml-1`}>
            오늘
          </button>
        </div>
        {navigating && <span className="text-xs text-zinc-400">불러오는 중…</span>}
        <div className="ml-auto flex items-center gap-2">
          <MemberPicker
            me={me}
            members={members}
            selectedIds={selectedIds}
            colors={colors}
            onChange={(ids) => go(ym, ids)}
          />
          <button
            type="button"
            onClick={() => setDialog({ kind: "new", date: ym === today.slice(0, 7) ? today : `${ym}-01` })}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 일정
          </button>
        </div>
      </header>

      {/* 보이는 사람 범례 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 text-xs sm:px-6">
        <span className="text-zinc-500">표시 중:</span>
        {TEAM_CATEGORY_KEYS.map((c) => (
          <LegendChip key={c} color={TEAM_CATEGORIES[c]} label={`Team·${c}`} />
        ))}
        <LegendChip color={MY_COLOR} label={`${me.name} (나)`} />
        {selectedIds.map((id) => (
          <LegendChip
            key={id}
            color={colorOf(id)}
            label={nameOf(id)}
            onRemove={() => go(ym, selectedIds.filter((x) => x !== id))}
          />
        ))}
      </div>

      <div className={`flex-1 lg:min-h-0 lg:overflow-auto ${navigating ? "opacity-60" : ""}`}>
        <div className="p-2 sm:p-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className={`py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-zinc-500"}`}>
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} className="grid grid-cols-7 border-b border-zinc-100 last:border-b-0">
                {week.map((date, i) => {
                  const dayEvents = sorted.filter((e) => eventOnDate(e, date));
                  const inMonth = date.startsWith(ym);
                  const hidden = dayEvents.length - MAX_PER_CELL;
                  return (
                    <div
                      key={date}
                      onClick={() => tapDay(date, () => setDialog({ kind: "new", date }))}
                      title="한 번 누르면 이 날 일정 목록, 두 번 누르면 새 일정 · 일정 위에서 두 번 누르면 그 일정 수정"
                      className={`group min-h-24 cursor-pointer touch-manipulation select-none border-r border-zinc-100 p-1 last:border-r-0 hover:bg-blue-50/40 sm:min-h-28 ${
                        inMonth ? "" : "bg-zinc-50/70"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between px-0.5">
                        <span
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                            date === today
                              ? "bg-blue-600 font-semibold text-white"
                              : !inMonth
                                ? "text-zinc-300"
                                : i === 0
                                  ? "text-red-500"
                                  : i === 6
                                    ? "text-blue-500"
                                    : "text-zinc-700"
                          }`}
                        >
                          {+date.slice(8)}
                        </span>
                        <span className="hidden text-xs text-zinc-400 group-hover:inline">+</span>
                      </div>
                      <ul className="space-y-0.5">
                        {dayEvents.slice(0, MAX_PER_CELL).map((e) => (
                          <li key={e.id}>
                            <EventChip
                              event={e}
                              color={eventColor(e)}
                              ownerName={!e.shared && othersShown && e.ownerId !== me.id ? nameOf(e.ownerId) : null}
                              onClick={() => tapDay(date, () => setDialog({ kind: "event", event: e }))}
                            />
                          </li>
                        ))}
                      </ul>
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDialog({ kind: "day", date });
                          }}
                          className="mt-0.5 w-full rounded px-1 text-left text-[11px] font-medium text-zinc-500 hover:bg-zinc-200"
                        >
                          +{hidden}개 더보기
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {dialog?.kind === "day" && (
        <DayDialog
          date={dialog.date}
          events={sorted.filter((e) => eventOnDate(e, dialog.date))}
          colorOf={eventColor}
          nameOf={nameOf}
          meId={me.id}
          onSelect={(event) => setDialog({ kind: "event", event })}
          onAdd={() => setDialog({ kind: "new", date: dialog.date })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "new" && (
        <EventDialog key={`new-${dialog.date}`} me={me} date={dialog.date} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "event" && (
        <EventDialog
          key={`event-${dialog.event.id}`}
          me={me}
          event={dialog.event}
          ownerName={nameOf(dialog.event.ownerId)}
          ownerColor={colorOf(dialog.event.ownerId)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ---------- 일정 칩 / 범례 ----------

function EventChip({
  event,
  color,
  ownerName,
  onClick,
}: {
  event: CalendarEvent;
  color: MemberColor;
  ownerName: string | null;
  onClick: () => void;
}) {
  const time = event.startTime && event.startDate === event.endDate ? event.startTime : null;
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      title={`${event.shared ? `[Team·${teamCategoryOf(event)}] ` : ""}${ownerName ? `[${ownerName}] ` : ""}${event.title} (${formatEventPeriod(event)})`}
      className={`block w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[11px] leading-tight hover:brightness-95 sm:text-xs ${color.chip}`}
    >
      {event.shared && <SharedBadge className="mr-1" />}
      {time && <span className="mr-1 tabular-nums opacity-70">{time}</span>}
      {ownerName && <span className="mr-1 font-semibold">{ownerName}</span>}
      {event.title}
    </button>
  );
}

function SharedBadge({ className = "", category }: { className?: string; category?: TeamCategory }) {
  return (
    <span className={`inline-block rounded bg-red-500 px-1 text-[10px] font-bold leading-4 text-white ${className}`}>
      Team{category && ` · ${category}`}
    </span>
  );
}

function LegendChip({ color, label, onRemove }: { color: MemberColor; label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-2 pr-2 text-zinc-700">
      <span className={`size-2.5 rounded-full ${color.dot}`} aria-hidden />
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 rounded-full px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={`${label} 일정 숨기기`}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ---------- 팀원 선택 ----------

function MemberPicker({
  me,
  members,
  selectedIds,
  colors,
  onChange,
}: {
  me: CalendarMember;
  members: CalendarMember[];
  selectedIds: number[];
  colors: Map<number, MemberColor>;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // 체크할 때마다 이동하지 않고, 창을 닫을 때 한 번에 반영한다
  const [draft, setDraft] = useState<number[]>(selectedIds);
  const ref = useRef<HTMLDivElement>(null);

  const others = members.filter(
    (m) =>
      m.id !== me.id &&
      (!q.trim() || m.name.includes(q.trim())),
  );

  const close = () => {
    setOpen(false);
    setQ("");
    const changed = draft.length !== selectedIds.length || draft.some((id) => !selectedIds.includes(id));
    if (changed) onChange(draft);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  const toggle = (id: number) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length >= MAX_SELECTED_MEMBERS ? d : [...d, id]));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : (setDraft(selectedIds), setOpen(true)))}
        aria-expanded={open}
        className={BUTTON}
      >
        팀원 선택{selectedIds.length > 0 && <span className="ml-1 text-blue-600">({selectedIds.length})</span>} ▾
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-zinc-200 bg-white shadow-lg"
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div className="border-b border-zinc-100 p-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 검색"
              className={INPUT}
              autoFocus
            />
          </div>
          <ul className="max-h-72 overflow-auto py-1">
            {others.map((m) => (
              <li key={m.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={draft.includes(m.id)}
                    onChange={() => toggle(m.id)}
                    className="size-4 accent-blue-600"
                  />
                  <span className={`size-2.5 rounded-full ${colors.get(m.id)?.dot ?? ""}`} aria-hidden />
                  {m.name}
                </label>
              </li>
            ))}
            {others.length === 0 && <li className="px-3 py-3 text-center text-sm text-zinc-500">팀원이 없습니다</li>}
          </ul>
          <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2">
            <button type="button" onClick={() => setDraft([])} className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline">
              모두 해제
            </button>
            <button type="button" onClick={close} className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-700">
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 대화상자 ----------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2.5 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function DayDialog({
  date,
  events,
  colorOf,
  nameOf,
  meId,
  onSelect,
  onAdd,
  onClose,
}: {
  date: string;
  events: CalendarEvent[];
  colorOf: (e: CalendarEvent) => MemberColor;
  nameOf: (id: number) => string;
  meId: number;
  onSelect: (e: CalendarEvent) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`${+date.slice(5, 7)}월 ${+date.slice(8)}일 (${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}) 일정 ${events.length}개`}
      onClose={onClose}
    >
      {events.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">등록된 일정이 없습니다.</p>}
      <ul className="space-y-1.5">
        {events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelect(e)}
              className={`block w-full rounded border-l-4 px-3 py-2 text-left hover:brightness-95 ${colorOf(e).chip}`}
            >
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs opacity-80">
                {e.shared && <SharedBadge category={teamCategoryOf(e)} />}
                <span className="font-semibold">{e.ownerId === meId ? "나" : nameOf(e.ownerId)}</span>
                <span className="tabular-nums">{formatEventPeriod(e)}</span>
              </span>
              {/* 제목은 자르지 않고 전부 보여준다 */}
              <span className="mt-0.5 block break-all text-sm font-medium">{e.title}</span>
              {e.memo && <span className="mt-0.5 line-clamp-2 block break-all text-xs opacity-70">{e.memo}</span>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAdd} className={`${BUTTON} mt-4 w-full`}>
        + 이 날 일정 추가
      </button>
    </Modal>
  );
}

/** 새 일정 등록, 본인 일정 수정, 다른 사람 일정 보기 */
function EventDialog({
  me,
  date,
  event,
  ownerName,
  ownerColor,
  onClose,
}: {
  me: CalendarMember;
  date?: string;
  event?: CalendarEvent;
  ownerName?: string;
  ownerColor?: MemberColor;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(event ? event.startTime === null : true);
  const [shared, setShared] = useState(event?.shared ?? false);
  const [colorKey, setColorKey] = useState(isEventColor(event?.color) ? event.color : "");
  const [teamCategory, setTeamCategory] = useState<TeamCategory>(
    event?.shared ? teamCategoryOf(event) : TEAM_CATEGORY_DEFAULT,
  );

  const isMine = !event || event.ownerId === me.id;
  const color = ownerColor ?? MY_COLOR;
  const owner = isMine ? `${me.name} (나)` : (ownerName ?? "");

  // 다른 사람 일정, 고객상담에서 자동 등록된 일정은 보기만
  if (event && (!isMine || event.consultId)) {
    return (
      <Modal title="일정 보기" onClose={onClose}>
        <div className="flex flex-wrap items-center gap-2">
          {event.shared && <SharedBadge category={teamCategoryOf(event)} />}
          <OwnerBadge color={color} name={event.shared ? `등록: ${owner}` : owner} />
        </div>
        <h3 className="mt-3 break-all text-lg font-semibold text-zinc-900">{event.title}</h3>
        <p className="mt-1 text-sm text-zinc-600">{formatEventPeriod(event)}</p>
        {event.memo && <p className="mt-4 whitespace-pre-wrap break-all rounded-md bg-zinc-50 p-3 text-sm text-zinc-800">{event.memo}</p>}
        {event.consultId && (
          <Link
            href={`/consult/${event.consultId}`}
            className="mt-4 block rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            상담노트 열기 →
          </Link>
        )}
      </Modal>
    );
  }

  const submit = (form: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = event ? await updateEventAction(event.id, form) : await createEventAction(form);
      if (res.ok) onClose();
      else setError(res.error);
    });
  };

  const remove = () => {
    if (!event || !confirm("이 일정을 삭제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteEventAction(event.id);
      if (res.ok) onClose();
      else setError(res.error);
    });
  };

  const start = event?.startDate ?? date ?? "";
  return (
    <Modal title={event ? "일정 수정" : "새 일정"} onClose={onClose}>
      <form action={submit} className="space-y-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-700">등록자</span>
          <OwnerBadge color={color} name={owner} />
        </div>
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-zinc-700">구분</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: EVENT_KIND_PERSONAL, label: "개인", hint: "나와 나를 선택한 사람에게" },
              { value: EVENT_KIND_SHARED, label: "Team", hint: "모든 사람에게 보임" },
            ].map((k) => (
              <label
                key={k.value}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-300 px-2.5 py-1.5 has-checked:border-blue-500 has-checked:bg-blue-50"
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={shared === (k.value === EVENT_KIND_SHARED)}
                  onChange={() => setShared(k.value === EVENT_KIND_SHARED)}
                  className="mt-0.5 size-4 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{k.label}</span>
                  <span className="block text-[11px] text-zinc-500">{k.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {shared ? (
          <fieldset>
            <legend className="mb-1 block text-xs font-medium text-zinc-700">Team 분류</legend>
            <div className="grid grid-cols-3 gap-2">
              {TEAM_CATEGORY_KEYS.map((c) => (
                <label
                  key={c}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border-l-4 px-2 py-1.5 text-sm font-medium has-checked:ring-2 has-checked:ring-zinc-900 has-checked:ring-offset-1 ${TEAM_CATEGORIES[c].chip}`}
                >
                  <input
                    type="radio"
                    name="teamCategory"
                    value={c}
                    checked={teamCategory === c}
                    onChange={() => setTeamCategory(c)}
                    className="size-4 accent-white"
                  />
                  {c}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">분류에 따라 달력에 표시되는 색이 정해집니다.</p>
          </fieldset>
        ) : (
          <fieldset>
            <legend className="mb-1 block text-xs font-medium text-zinc-700">색상</legend>
            <input type="hidden" name="color" value={colorKey} />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColorKey("")}
                aria-pressed={colorKey === ""}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  colorKey === "" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                기본
              </button>
              {Object.entries(EVENT_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColorKey(key)}
                  aria-pressed={colorKey === key}
                  aria-label={c.label}
                  title={c.label}
                  className={`size-6 rounded-full ${c.dot} ${
                    colorKey === key ? "ring-2 ring-zinc-900 ring-offset-2" : "hover:scale-110"
                  }`}
                />
              ))}
            </div>
            <p className="mt-1.5">
              <span
                className={`inline-block rounded border-l-[3px] px-2 py-0.5 text-xs ${
                  (isEventColor(colorKey) ? EVENT_COLORS[colorKey] : color).chip
                }`}
              >
                미리보기
              </span>
            </p>
          </fieldset>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-700">제목</span>
          <input name="title" required maxLength={EVENT_TITLE_MAX} defaultValue={event?.title} className={INPUT} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-700">시작일</span>
            <input type="date" name="startDate" required defaultValue={start} className={INPUT} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-700">종료일</span>
            <input type="date" name="endDate" required defaultValue={event?.endDate ?? start} className={INPUT} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="allDay"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4 accent-blue-600"
          />
          종일
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700">시작시간</span>
              <input type="time" name="startTime" required defaultValue={event?.startTime ?? "09:00"} className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-700">종료시간 (선택)</span>
              <input type="time" name="endTime" defaultValue={event?.endTime ?? ""} className={INPUT} />
            </label>
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-700">메모 (선택)</span>
          <textarea name="memo" rows={3} maxLength={EVENT_MEMO_MAX} defaultValue={event?.memo} className={INPUT} />
        </label>

        {error && (
          <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          {event && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              삭제
            </button>
          )}
          <button type="button" onClick={onClose} className={`${BUTTON} ml-auto`}>
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OwnerBadge({ color, name }: { color: MemberColor; name: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border-l-[3px] px-2 py-1 text-sm font-medium ${color.chip}`}>
      <span className={`size-2.5 rounded-full ${color.dot}`} aria-hidden />
      {name}
    </span>
  );
}

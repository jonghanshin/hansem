import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { fetchCalendarMembers, fetchEvents } from "@/lib/calendar";
import { exclusionFor } from "@/lib/excluded-users";
import { MAX_SELECTED_MEMBERS, monthRange, parseYearMonth, todayInKorea } from "@/lib/calendar-shared";

import { CalendarView } from "./calendar-view";

export const metadata = { title: "팀 캘린더 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">캘린더를 불러오는 중…</p>}>
        <CalendarContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  const sp = await searchParams;
  const today = todayInKorea();
  const ym = parseYearMonth(one(sp.ym)) ?? today.slice(0, 7);

  // ?me=0 → 내 개인 일정 숨기기 (기본은 보임)
  const showMe = one(sp.me) !== "0";
  const result = await loadCalendar(session.uid, ym, one(sp.users), showMe).then(
    (data) => ({ ok: true as const, ...data }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">캘린더를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }

  return (
    <CalendarView
      ym={ym}
      today={today}
      me={{ id: session.uid, name: session.name }}
      members={result.members}
      selectedIds={result.selectedIds}
      showMe={showMe}
      events={result.events}
    />
  );
}

async function loadCalendar(uid: number, ym: string, usersParam: string, showMe: boolean) {
  // 열외 계정은 팀원 목록·일정에서 뺀다 (본인이 열외면 모두 보인다)
  const excludedIds = (await exclusionFor(uid)).ids;
  const members = await fetchCalendarMembers(excludedIds);
  const memberIds = new Set(members.map((m) => m.id));
  // ?users=3,5 → 함께 볼 다른 팀원 (본인·없는 사람 제외)
  const selectedIds = [
    ...new Set(
      usersParam
        .split(",")
        .map(Number)
        .filter((id) => memberIds.has(id) && id !== uid),
    ),
  ].slice(0, MAX_SELECTED_MEMBERS);

  const { from, to } = monthRange(ym);
  const events = await fetchEvents(showMe ? [uid, ...selectedIds] : selectedIds, from, to, excludedIds);
  return { members, selectedIds, events };
}

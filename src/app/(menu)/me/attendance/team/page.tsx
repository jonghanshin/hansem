import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { fetchTeamAttendance, todayKst, type TeamAttendanceRow } from "@/lib/attendance";
import { addDays, formatClock, isYmd } from "@/lib/attendance-shared";
import { requireUser } from "@/lib/auth";
import { fetchCalendarMembers } from "@/lib/calendar";
import { exclusionFor } from "@/lib/excluded-users";

import { MyInfoTabs } from "../../my-info-tabs";
import { AttendanceTabs } from "../attendance-tabs";

export const metadata = { title: "팀원 출근현황 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function TeamAttendancePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <MyInfoTabs active="attendance" />
        <AttendanceTabs active="team" />
        <Suspense fallback={<p className="text-sm text-zinc-500">출근현황을 불러오는 중…</p>}>
          <TeamAttendance searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function TeamAttendance({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  const sp = await searchParams;
  const today = todayKst();
  const raw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const date = raw && isYmd(raw) ? raw : today;
  const next = addDays(date, 1);

  const result = await (async () => {
    // 열외 계정은 팀원 목록에서 뺀다 (본인이 열외면 모두 보인다)
    const excluded = (await exclusionFor(session.uid)).ids;
    const [members, rows] = await Promise.all([fetchCalendarMembers(excluded), fetchTeamAttendance(date, next)]);
    return { members, rows };
  })().then(
    (d) => ({ ok: true as const, ...d }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );

  // 사람별: 첫 출근, 마지막 퇴근, 그날 출근 예정지, 다음 날 출근 예정지 (예정지는 마지막에 정한 것)
  type Status = { in?: TeamAttendanceRow; out?: TeamAttendanceRow; plan?: TeamAttendanceRow; nextPlan?: TeamAttendanceRow };
  const byUser = new Map<number, Status>();
  if (result.ok) {
    for (const r of result.rows) {
      const s = byUser.get(r.사용자) ?? {};
      if (r.근무일 === date) {
        if (r.구분 === "출근") s.in ??= r;
        else if (r.구분 === "퇴근") s.out = r;
        else s.plan = r;
      } else if (r.구분 === "출근예정") s.nextPlan = r;
      byUser.set(r.사용자, s);
    }
  }
  const members = result.ok ? result.members : [];
  const checkedIn = members.filter((m) => byUser.get(m.id)?.in).length;
  const checkedOut = members.filter((m) => byUser.get(m.id)?.out).length;
  // 출근한 사람(출근 시각 순) → 아직 출근 안 한 사람(이름 순)
  const sorted = [...members].sort((a, b) => {
    const ai = byUser.get(a.id)?.in?.기록일시;
    const bi = byUser.get(b.id)?.in?.기록일시;
    if (ai && bi) return ai.localeCompare(bi);
    if (ai) return -1;
    if (bi) return 1;
    return 0;
  });

  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const NAV = "rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <Link href={`/me/attendance/team?date=${addDays(date, -1)}`} className={NAV} aria-label="전날">
            ‹
          </Link>
          <span className="min-w-36 text-center text-base font-semibold text-zinc-900 tabular-nums">
            {date} ({weekday})
          </span>
          <Link href={`/me/attendance/team?date=${next}`} className={NAV} aria-label="다음 날">
            ›
          </Link>
          {date !== today && (
            <Link href="/me/attendance/team" className={`${NAV} ml-1`}>
              오늘
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {!result.ok ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">출근현황을 불러오지 못했습니다</p>
            <p className="mt-1 whitespace-pre-line">{result.error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="전체" value={`${members.length}명`} />
              <Stat label="출근" value={`${checkedIn}명`} tone="text-blue-700" />
              <Stat label="퇴근" value={`${checkedOut}명`} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">이름</th>
                    <th className="px-3 py-2 text-left font-medium">출근</th>
                    <th className="px-3 py-2 text-left font-medium">퇴근</th>
                    <th className="px-3 py-2 text-left font-medium">다음 날 출근 예정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sorted.map((m) => {
                    const s = byUser.get(m.id) ?? {};
                    return (
                      <tr key={m.id} className={m.id === session.uid ? "bg-blue-50/40" : undefined}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap text-zinc-900">{m.name}</td>
                        <td className="px-3 py-2">
                          {s.in ? (
                            <Cell time={formatClock(s.in.기록일시)} place={s.in.장소} tone="text-blue-700" />
                          ) : s.plan ? (
                            <span className="text-xs text-amber-700">미출근 · 예정: {s.plan.장소}</span>
                          ) : (
                            <span className="text-xs text-zinc-400">미출근</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {s.out ? <Cell time={formatClock(s.out.기록일시)} place={s.out.장소} /> : <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-zinc-800">
                          {s.nextPlan ? s.nextPlan.장소 : <span className="text-zinc-300">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ time, place, tone = "text-zinc-900" }: { time: string; place: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={`font-semibold tabular-nums ${tone}`}>{time}</span>
      <span className="text-zinc-700">{place}</span>
    </span>
  );
}

function Stat({ label, value, tone = "text-zinc-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

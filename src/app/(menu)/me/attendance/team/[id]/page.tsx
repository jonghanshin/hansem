import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { fetchMyAttendance, todayKst } from "@/lib/attendance";
import { formatClock, isYmd, type AttendanceRecord } from "@/lib/attendance-shared";
import { requireUser } from "@/lib/auth";
import { fetchCalendarMembers } from "@/lib/calendar";
import { canApprove } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

import { MyInfoTabs } from "../../../my-info-tabs";
import { AttendanceTabs } from "../../attendance-tabs";

export const metadata = { title: "팀원 근태 상세 | 현장정보 관리" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 근태는 한 달치만 보관하므로 넉넉히 */
const MAX_ROWS = 500;

export default function MemberAttendancePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <MyInfoTabs active="attendance" />
        <AttendanceTabs active="team" />
        <Suspense fallback={<p className="text-sm text-zinc-500">근태 기록을 불러오는 중…</p>}>
          <MemberAttendance params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function MemberAttendance({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  if (!canApprove(session)) redirect("/me/attendance/team"); // 관리자 이상만 (주소를 직접 입력해도 막음)
  const id = Number((await params).id);
  const sp = await searchParams;
  const rawDate = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  // 목록으로 돌아갈 때 보던 날짜 유지
  const backHref = rawDate && isYmd(rawDate) ? `/me/attendance/team?date=${rawDate}` : "/me/attendance/team";

  const result = await (async () => {
    // 열외 계정은 볼 수 없다 (본인이 열외면 모두 보인다)
    const members = await fetchCalendarMembers((await exclusionFor(session.uid)).ids);
    const member = members.find((m) => m.id === id);
    if (!member) return null;
    return { member, records: await fetchMyAttendance(id, MAX_ROWS) };
  })().then(
    (d) => ({ ok: true as const, data: d }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );

  const back = (
    <Link href={backHref} className="text-sm font-medium text-blue-600 hover:underline">
      ← 팀원 출근현황
    </Link>
  );
  if (!result.ok) {
    return (
      <div className="space-y-3">
        {back}
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">근태 기록을 불러오지 못했습니다</p>
          <p className="mt-1 whitespace-pre-line">{result.error}</p>
        </div>
      </div>
    );
  }
  if (!result.data) {
    return (
      <div className="space-y-3">
        {back}
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">팀원을 찾을 수 없습니다.</p>
      </div>
    );
  }
  const { member, records } = result.data;
  const today = todayKst();

  // 근무일별 요약: 첫 출근, 마지막 퇴근, 그날 출근 예정지 (기록은 최신순으로 들어온다)
  type Day = { date: string; in?: AttendanceRecord; out?: AttendanceRecord; plan?: AttendanceRecord; all: AttendanceRecord[] };
  const days = new Map<string, Day>();
  for (const r of records) {
    const d = days.get(r.근무일) ?? { date: r.근무일, all: [] };
    d.all.push(r);
    if (r.구분 === "출근") d.in = r; // 최신순이므로 마지막에 덮어쓴 것이 첫 출근
    else if (r.구분 === "퇴근") d.out ??= r;
    else d.plan ??= r;
    days.set(r.근무일, d);
  }
  const dayList = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  const workDays = dayList.filter((d) => d.in).length;
  const officeCount = (place: string) => dayList.filter((d) => d.in?.장소구분 === place).length;

  return (
    <div className="space-y-5">
      {back}

      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">{member.name}</h2>
          <span className="text-xs text-zinc-500">최근 한 달 기록</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="출근일" value={`${workDays}일`} />
          <Stat label="죽전사무실" value={`${officeCount("죽전사무실")}일`} />
          <Stat label="죽전스타필드" value={`${officeCount("죽전스타필드")}일`} />
          <Stat label="현장·기타" value={`${officeCount("현장") + officeCount("기타")}일`} />
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">일자별</h2>
        {dayList.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">기록이 없습니다.</p>
        ) : (
          // 표 대신 날짜별 묶음: 폰에서도 장소가 줄바꿈되어 모두 보인다
          <ul className="divide-y divide-zinc-100">
            {dayList.map((d) => {
              const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
              return (
                <li
                  key={d.date}
                  className={`grid gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[6rem_1fr] ${
                    d.date === today ? "-mx-2 rounded bg-blue-50/60 px-2" : ""
                  }`}
                >
                  <p
                    className={`font-semibold tabular-nums ${
                      wd === 0 ? "text-red-600" : wd === 6 ? "text-blue-600" : "text-zinc-800"
                    }`}
                  >
                    {d.date.slice(5)} ({WEEKDAYS[wd]})
                  </p>
                  <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5">
                    <dt className="text-zinc-500">출근</dt>
                    <dd className="min-w-0 break-words">
                      {d.in ? <Line time={formatClock(d.in.기록일시)} place={d.in.장소} tone="text-blue-700" /> : <Dash />}
                    </dd>
                    <dt className="text-zinc-500">퇴근</dt>
                    <dd className="min-w-0 break-words">
                      {d.out ? <Line time={formatClock(d.out.기록일시)} place={d.out.장소} /> : <Dash />}
                    </dd>
                    {d.plan && (
                      <>
                        <dt className="text-zinc-500">예정지</dt>
                        <dd className="min-w-0 break-words text-amber-800">{d.plan.장소}</dd>
                      </>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">전체 기록</h2>
        {records.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {records.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 py-1.5">
                <span className="w-12 shrink-0 text-zinc-500 tabular-nums">{r.근무일.slice(5)}</span>
                <span className="w-12 shrink-0 text-zinc-900 tabular-nums">{formatClock(r.기록일시)}</span>
                <span
                  className={`w-14 shrink-0 font-medium ${
                    r.구분 === "출근" ? "text-blue-700" : r.구분 === "출근예정" ? "text-amber-700" : "text-zinc-700"
                  }`}
                >
                  {r.구분}
                </span>
                <span className="min-w-0 break-words text-zinc-800">{r.장소}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 시각 + 장소 (장소는 줄바꿈 허용) */
function Line({ time, place, tone = "text-zinc-900" }: { time: string; place: string; tone?: string }) {
  return (
    <>
      <span className={`mr-1.5 font-semibold tabular-nums ${tone}`}>{time}</span>
      <span className="text-zinc-700">{place}</span>
    </>
  );
}

function Dash() {
  return <span className="text-zinc-300">-</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-900 tabular-nums">{value}</p>
    </div>
  );
}

const CARD = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5";

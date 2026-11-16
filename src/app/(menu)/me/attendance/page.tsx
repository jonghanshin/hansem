import { connection } from "next/server";
import { Suspense } from "react";

import { fetchMyAttendance, todayKst, tomorrowKst } from "@/lib/attendance";
import type { MySiteOption } from "@/lib/attendance-shared";
import { requireUser, resolveScope } from "@/lib/auth";
import { fetchSites } from "@/lib/sites-data";

import { MyInfoTabs } from "../my-info-tabs";
import { AttendancePanel } from "./attendance-panel";
import { AttendanceTabs } from "./attendance-tabs";

export const metadata = { title: "근태관리 | 현장정보 관리" };

export default function AttendancePage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <MyInfoTabs active="attendance" />
        <AttendanceTabs active="mine" />
        <Suspense fallback={<p className="text-sm text-zinc-500">근태 기록을 불러오는 중…</p>}>
          <Attendance />
        </Suspense>
      </div>
    </main>
  );
}

async function Attendance() {
  await connection();
  const session = await requireUser();
  const mine = { ...(await resolveScope(session)), salesName: session.name };
  const result = await Promise.all([fetchMyAttendance(session.uid), fetchSites(mine)]).then(
    ([records, sites]) => ({ ok: true as const, records, sites }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">근태 기록을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  const sites: MySiteOption[] = result.sites
    .filter((s) => !s.완료일 && s.현장번호)
    .sort((a, b) => (b.계약일 ?? "").localeCompare(a.계약일 ?? ""))
    .map((s) => ({ 현장번호: s.현장번호 as string, 고객명: s.고객명 ?? null, 현장주소: s.현장주소 ?? null }));

  return <AttendancePanel records={result.records} sites={sites} today={todayKst()} tomorrow={tomorrowKst()} />;
}

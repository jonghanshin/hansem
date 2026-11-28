import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { BonusDetailButton } from "@/app/bonus-detail-button";
import { PayslipView } from "@/app/payslip-view";
import { PrintButton } from "@/app/print-button";
import { todayKst } from "@/lib/attendance";
import { requireUser } from "@/lib/auth";
import { canViewPayslips, fetchConfirmedSettlements, fetchPayslipsForUser } from "@/lib/payroll";
import {
  bonusFor,
  formatMonth,
  formatWon,
  isReleased,
  isYearMonth,
  RELEASE_DAY,
  settlementMonthFor,
  withBonus,
} from "@/lib/payroll-shared";

import { MyInfoTabs } from "../my-info-tabs";

export const metadata = { title: "급여명세서 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function MyPayslipsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto print:bg-white">
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 print:p-0">
        <div className="print:hidden">
          <MyInfoTabs active="payslips" />
        </div>
        <Suspense fallback={<p className="text-sm text-zinc-500">급여명세서를 불러오는 중…</p>}>
          <MyPayslips searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function MyPayslips({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  // 권한.월급명세가 Y인 사용자만 (주소로 바로 들어와도 막는다)
  if (!(await canViewPayslips(session.uid).catch(() => false))) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
        급여명세서를 볼 수 있는 계정이 아닙니다.
      </div>
    );
  }
  const today = todayKst();
  const result = await fetchPayslipsForUser(session.uid).then(
    (slips) => ({ ok: true as const, slips }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">급여명세서를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }

  // 귀속월 RELEASE_DAY(28)일부터 본인에게 보인다 (관리자가 미리 작성한 다음 달 명세서 등은 숨긴다)
  const released = result.slips.filter((s) => isReleased(s.귀속월, today));
  // 성과급: 한 달 전 정산월의 정산정보가 확정이면 그 정산금 (조회에 실패하면 저장된 성과급 그대로)
  const me = { 영업사원ID: session.sid, 이름: session.name };
  const settlements = await fetchConfirmedSettlements(
    released.map((s) => settlementMonthFor(s.귀속월)),
    [me],
  ).catch(() => []);
  const slips = released.map((s) => withBonus(s, bonusFor(settlements, me, s.귀속월)));
  const sp = await searchParams;
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  // 주소로 고른 달의 명세서가 없으면(입사 전 등) 다른 달을 대신 보여주지 않는다
  const requested = isYearMonth(raw) ? raw : null;
  const selected = requested ? slips.find((s) => s.귀속월 === requested) : slips[0];

  if (slips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
        아직 볼 수 있는 급여명세서가 없습니다.
        <br />
        명세서는 매월 {RELEASE_DAY}일부터 해당 월분을 확인할 수 있습니다.
      </div>
    );
  }

  // 연도별로 묶는다 (최근 연도·월부터)
  const byYear = new Map<string, typeof slips>();
  for (const s of slips) {
    const y = s.귀속월.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), s]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr] print:block">
      <nav className="space-y-3 self-start print:hidden" aria-label="지난 명세서">
        {[...byYear].map(([year, list]) => (
          <section key={year} className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <h2 className="border-b border-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900">{year}년</h2>
            <ul className="divide-y divide-zinc-100">
              {list.map((s) => {
                const active = s.귀속월 === selected?.귀속월;
                return (
                  <li key={s.귀속월}>
                    <Link
                      href={`/me/payslips?month=${s.귀속월}`}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${active ? "bg-blue-50" : "hover:bg-zinc-50"}`}
                    >
                      <span className={active ? "font-semibold text-blue-700" : "text-zinc-800"}>{Number(s.귀속월.slice(5))}월분</span>
                      <span className="text-xs tabular-nums text-zinc-500">{formatWon(s.차인지급액)}원</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      {selected ? (
        <section className="self-start rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 print:border-0 print:p-0 print:shadow-none">
          <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
            <span className="text-sm font-semibold text-zinc-900">{formatMonth(selected.귀속월)}분</span>
            <PrintButton />
          </div>
          {/* 확정 정산금으로 성과급을 채운 달은 성과급을 눌러 정산 상세를 본다 */}
          <PayslipView
            slip={selected}
            bonusSlot={bonusFor(settlements, me, selected.귀속월) ? <BonusDetailButton month={selected.귀속월} /> : undefined}
          />
        </section>
      ) : (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          {requested ? formatMonth(requested) : ""}분 급여명세서가 없습니다.
          <br />
          왼쪽 목록에서 확인할 달을 선택하세요.
        </div>
      )}
    </div>
  );
}

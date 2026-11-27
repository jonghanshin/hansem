import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { todayKst } from "@/lib/attendance";
import { requireUser } from "@/lib/auth";
import { canApprove, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";
import {
  fetchPayrollBase,
  fetchPayrollBaseYears,
  fetchConfirmedSettlements,
  fetchPayrollMembers,
  fetchPayslipsByMonth,
  fetchPayslipsForUser,
} from "@/lib/payroll";
import {
  bonusFor,
  formatMonth,
  formatWon,
  isReleased,
  isYearMonth,
  positionFromAuth,
  RELEASE_DAY,
  settlementMonthFor,
  shiftMonth,
  withBonus,
} from "@/lib/payroll-shared";

import { BaseForm } from "./base-form";
import { SlipEditor } from "./slip-editor";

export const metadata = { title: "급여 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function PayrollPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">급여 정보를 불러오는 중…</p>}>
        <Payroll searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 whitespace-pre-line">{message}</p>
    </div>
  );
}

async function Payroll({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  if (!canApprove(session)) return <ErrorBox title="권한이 없습니다" message="급여 메뉴는 관리자 이상만 사용할 수 있습니다." />;

  const sp = await searchParams;
  const tab = one(sp.tab) === "base" ? "base" : "slips";
  const today = todayKst();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-4 pt-3 sm:px-6 print:hidden">
        <h1 className="pb-3 text-lg font-semibold text-zinc-900">급여</h1>
        <nav className="flex gap-1 self-end" aria-label="급여 메뉴">
          {(
            [
              ["slips", "/payroll", "월급명세서 작성"],
              ["base", "/payroll?tab=base", "기준정보"],
            ] as const
          ).map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium ${
                tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {tab === "base" ? (
        <BaseTab rawYear={one(sp.year)} today={today} />
      ) : (
        <SlipsTab
          uid={session.uid}
          // 이번 달 이후(미래 달)는 작성·조회하지 않는다. 주소로 미래 달을 넣으면 이번 달로
          month={isYearMonth(one(sp.month)) && (one(sp.month) as string) <= today.slice(0, 7) ? (one(sp.month) as string) : today.slice(0, 7)}
          rawUser={one(sp.user)}
          showAll={one(sp.all) === "1"}
          today={today}
        />
      )}
    </div>
  );
}

// ---------- 기준정보 ----------

async function BaseTab({ rawYear, today }: { rawYear: string | undefined; today: string }) {
  const thisYear = Number(today.slice(0, 4));
  const year = rawYear && /^\d{4}$/.test(rawYear) && Number(rawYear) >= 2000 && Number(rawYear) <= 2100 ? Number(rawYear) : thisYear;
  const result = await Promise.all([fetchPayrollBase(year), fetchPayrollBaseYears()]).then(
    ([resolved, years]) => ({ ok: true as const, resolved, years }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) return <ErrorBox title="기준정보를 불러오지 못했습니다" message={result.error} />;
  const { resolved, years } = result;
  const NAV = "rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/payroll?tab=base&year=${year - 1}`} className={NAV} aria-label="이전 연도">
          ‹
        </Link>
        <span className="min-w-20 text-center text-base font-semibold text-zinc-900 tabular-nums">{year}년</span>
        <Link href={`/payroll?tab=base&year=${year + 1}`} className={NAV} aria-label="다음 연도">
          ›
        </Link>
        {year !== thisYear && (
          <Link href="/payroll?tab=base" className={`${NAV} ml-1`}>
            올해
          </Link>
        )}
        {years.length > 0 && (
          <span className="ml-auto text-xs text-zinc-500">
            저장된 연도:{" "}
            {years.map((y, i) => (
              <span key={y}>
                {i > 0 && ", "}
                <Link href={`/payroll?tab=base&year=${y}`} className="text-blue-600 hover:underline">
                  {y}
                </Link>
              </span>
            ))}
          </span>
        )}
      </div>

      {resolved.sourceYear !== year && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {year}년 기준정보가 아직 저장되지 않았습니다.{" "}
          {resolved.sourceYear ? `${resolved.sourceYear}년 값을` : "기본값(2026년 월급표)을"} 불러왔습니다. 확인 후 저장하세요.
        </p>
      )}

      <BaseForm
        key={year}
        year={year}
        initial={resolved.base}
        savedInfo={
          resolved.sourceYear === year && resolved.수정일시
            ? `${resolved.수정자 ?? ""} · ${new Date(resolved.수정일시).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
            : null
        }
      />
    </div>
  );
}

// ---------- 월급명세서 ----------

async function SlipsTab({
  uid,
  month,
  rawUser,
  showAll,
  today,
}: {
  uid: number;
  month: string;
  rawUser: string | undefined;
  showAll: boolean;
  today: string;
}) {
  const selectedId = rawUser && /^\d+$/.test(rawUser) ? Number(rawUser) : null;
  const result = await (async () => {
    const [directory, exclusion, slips, resolved, history] = await Promise.all([
      fetchPayrollMembers(),
      exclusionFor(uid),
      fetchPayslipsByMonth(month),
      fetchPayrollBase(Number(month.slice(0, 4))),
      selectedId ? fetchPayslipsForUser(selectedId) : Promise.resolve([]),
    ]);
    const settlements = await fetchConfirmedSettlements([settlementMonthFor(month)]);
    return { directory, exclusion, slips, resolved, history, settlements };
  })().then(
    (d) => ({ ok: true as const, ...d }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) return <ErrorBox title="급여명세서를 불러오지 못했습니다" message={result.error} />;
  const { directory, exclusion, resolved, history, settlements } = result;

  // 성과급: 한 달 전 정산월의 확정 정산금 (저장된 명세서에도 보여줄 때 적용한다)
  const bonusByUser = new Map(directory.map((u) => [u.id, bonusFor(settlements, u, month)]));
  const slips = result.slips.map((s) => withBonus(s, bonusByUser.get(s.사용자) ?? null));
  const slipByUser = new Map(slips.map((s) => [s.사용자, s]));
  // 기본은 RD와 월급명세가 Y인 직원. 이미 명세서가 있는 직원은 역할과 상관없이 보인다
  const members = directory
    .filter((u) => !exclusion.ids.includes(u.id))
    .filter((u) => showAll || u.역할 === RESTRICTED_ROLE || u.월급명세 || slipByUser.has(u.id))
    .sort((a, b) => a.이름.localeCompare(b.이름, "ko"));
  const selected = selectedId ? directory.find((u) => u.id === selectedId && !exclusion.ids.includes(u.id)) : undefined;
  const existing = selected ? (slipByUser.get(selected.id) ?? null) : null;
  // 새로 작성할 때 부서·호봉은 그 직원의 가장 최근 명세서에서 가져온다 (직급·입사일은 권한 테이블)
  const previous = history.find((s) => s.귀속월 < month) ?? history[0] ?? null;

  const q = (m: string, user?: number | null) =>
    `/payroll?month=${m}${user ? `&user=${user}` : ""}${showAll ? "&all=1" : ""}`;
  const NAV = "rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100";
  const total = slips.reduce((n, s) => n + s.차인지급액, 0);
  const released = isReleased(month, today);

  return (
    <div className="space-y-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
        <div className="flex items-center gap-1">
          <Link href={q(shiftMonth(month, -1), selectedId)} className={NAV} aria-label="이전 달">
            ‹
          </Link>
          <span className="min-w-28 text-center text-base font-semibold text-zinc-900 tabular-nums">{formatMonth(month)}</span>
          {month < today.slice(0, 7) ? (
            <Link href={q(shiftMonth(month, 1), selectedId)} className={NAV} aria-label="다음 달">
              ›
            </Link>
          ) : (
            <span className={`${NAV} cursor-not-allowed opacity-40`} aria-disabled="true" title="이번 달 이후는 작성할 수 없습니다">
              ›
            </span>
          )}
          {month !== today.slice(0, 7) && (
            <Link href={q(today.slice(0, 7), selectedId)} className={`${NAV} ml-1`}>
              이번 달
            </Link>
          )}
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${released ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}
        >
          {released ? "직원 공개 중" : `${month}-${RELEASE_DAY}부터 직원에게 공개`}
        </span>
        <span className="text-xs text-zinc-500">
          기준정보:{" "}
          <Link href={`/payroll?tab=base&year=${month.slice(0, 4)}`} className="text-blue-600 hover:underline">
            {resolved.sourceYear ? `${resolved.sourceYear}년` : "기본값(미저장)"}
          </Link>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr] print:block">
        {/* 직원 목록 */}
        <section className="self-start rounded-xl border border-zinc-200 bg-white shadow-sm print:hidden">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
            <span className="text-sm font-semibold text-zinc-900">
              직원 <span className="font-normal text-zinc-500">작성 {slips.length}명</span>
            </span>
            <Link
              href={`/payroll?month=${month}${selectedId ? `&user=${selectedId}` : ""}${showAll ? "" : "&all=1"}`}
              className="text-xs text-blue-600 hover:underline"
            >
              {showAll ? "급여 대상만 보기" : "전체 직원 보기"}
            </Link>
          </div>
          {members.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">직원이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {members.map((u) => {
                const s = slipByUser.get(u.id);
                const active = u.id === selected?.id;
                return (
                  <li key={u.id}>
                    <Link
                      href={q(month, u.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                        active ? "bg-blue-50" : "hover:bg-zinc-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`font-medium ${active ? "text-blue-700" : "text-zinc-900"}`}>{u.이름}</span>
                        <span className="ml-1.5 text-xs text-zinc-400">{u.직급 ?? u.역할}</span>
                      </span>
                      {s ? (
                        <span className="text-right text-xs tabular-nums text-zinc-700">{formatWon(s.차인지급액)}</span>
                      ) : (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">미작성</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {slips.length > 0 && (
            <div className="flex justify-between border-t border-zinc-200 px-3 py-2 text-xs">
              <span className="text-zinc-500">차인지급액 합계</span>
              <span className="font-semibold tabular-nums text-zinc-900">{formatWon(total)}원</span>
            </div>
          )}
        </section>

        {/* 명세서 작성 (입사한 달 이전은 작성하지 않는다. 이미 저장된 명세서는 삭제할 수 있게 보여준다) */}
        {selected && !existing && selected.입사일 && month < selected.입사일.slice(0, 7) ? (
          <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            {selected.이름}님은 {selected.입사일}에 입사해 {formatMonth(month)}분 월급명세서가 없습니다.
          </div>
        ) : selected ? (
          <SlipEditor
            key={`${selected.id}-${month}`}
            user={{ id: selected.id, 이름: selected.이름, 직급: selected.직급, 입사일: selected.입사일, 기본급: selected.기본급 }}
            authPosition={positionFromAuth(selected.직급)}
            bonus={bonusByUser.get(selected.id) ?? null}
            month={month}
            base={resolved.base}
            existing={existing}
            previous={existing ? null : previous}
          />
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
            왼쪽 목록에서 직원을 선택하면 {formatMonth(month)}분 월급명세서를 작성할 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}

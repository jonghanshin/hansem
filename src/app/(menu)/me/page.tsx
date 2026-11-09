import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { countPendingRequests, countRejectedRequests } from "@/lib/approvals";
import { fetchMyProfile, MIN_PASSWORD_LENGTH, requireUser } from "@/lib/auth";
import { formatBoardDate } from "@/lib/board-shared";
import { canApprove, scopeFor } from "@/lib/data-scope";
import { formatMoney, type Site } from "@/lib/sites";
import { fetchAllDeposits, fetchSites } from "@/lib/sites-data";

import { PasswordForm } from "./password-form";

export const metadata = { title: "나의정보 | 현장정보 관리" };

export default function MyInfoPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">나의정보를 불러오는 중…</p>}>
        <MyInfo />
      </Suspense>
    </main>
  );
}

async function MyInfo() {
  await connection();
  const session = await requireUser();
  // '내가 진행한 현장' = 현장정보·입금내역의 영업사원이 내 이름인 행 (역할과 상관없이 본인 것만)
  const mine = { ...scopeFor(session), salesName: session.name };
  const result = await Promise.all([
    fetchMyProfile(session.uid),
    fetchSites(mine),
    fetchAllDeposits(mine),
    countPendingRequests(mine, session.uid),
    countRejectedRequests(session.uid),
  ]).then(
    ([profile, sites, deposits, pending, rejected]) => ({ ok: true as const, profile, sites, deposits, pending, rejected }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">나의정보를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  const { profile, sites, deposits, pending, rejected } = result;

  // ---- 현장 요약 ----
  const active = sites.filter((s) => !s.완료일);
  const done = sites.length - active.length;
  const sum = (list: Site[]) => list.reduce((n, s) => n + (s.계약가 ?? 0), 0);
  const unsettled = sites.filter((s) => s.정산여부?.trim() === "미정산").length;
  const year = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 4);
  const thisYear = sites.filter((s) => s.계약일?.startsWith(year));

  // ---- 입금 요약 ----
  let depositIn = 0;
  let depositOut = 0;
  const inBySite = new Map<string, number>();
  for (const d of deposits) {
    if (d.amount === null) continue;
    if (d.입출금 === "출금") depositOut += d.amount;
    else if (d.입출금 === "입금") {
      depositIn += d.amount;
      if (d.현장번호) inBySite.set(d.현장번호, (inBySite.get(d.현장번호) ?? 0) + d.amount);
    }
  }

  // 진행 중인 현장: 최근 계약일 순
  const activeList = [...active].sort((a, b) => (b.계약일 ?? "").localeCompare(a.계약일 ?? "")).slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-zinc-900">나의정보</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 내 정보 */}
        <section className={CARD}>
          <h2 className={CARD_TITLE}>내 정보</h2>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
            <dt className="text-zinc-500">이름</dt>
            <dd className="font-semibold text-zinc-900">{profile?.이름 ?? session.name}</dd>
            <dt className="text-zinc-500">ID</dt>
            <dd className="text-zinc-900 tabular-nums">{profile?.영업사원ID ?? session.sid}</dd>
            <dt className="text-zinc-500">역할</dt>
            <dd className="text-zinc-900">
              {profile?.역할 ?? (session.role || "-")}
              {canApprove(session) && (
                <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">승인 권한</span>
              )}
            </dd>
            <dt className="text-zinc-500">최근 로그인</dt>
            <dd className="text-zinc-900">{profile?.접속시간 ? formatBoardDate(profile.접속시간, true) : "-"}</dd>
          </dl>
        </section>

        {/* 비밀번호 변경 */}
        <section className={CARD}>
          <h2 className={CARD_TITLE}>비밀번호 변경</h2>
          <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
        </section>
      </div>

      {/* 현장 요약 */}
      <section className={CARD}>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">내 현장 요약</h2>
          <Link href="/sites" className="text-xs font-medium text-blue-600 hover:underline">
            현장정보 보기 →
          </Link>
        </div>

        {sites.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            영업사원이 &lsquo;{session.name}&rsquo;(으)로 등록된 현장이 없습니다.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="전체 현장" value={`${sites.length}건`} sub={`진행 ${active.length} · 완료 ${done}`} />
              <Stat label="진행 중 계약가" value={`${formatMoney(sum(active))}원`} sub={`${active.length}건`} />
              <Stat label={`${year}년 계약`} value={`${thisYear.length}건`} sub={`${formatMoney(sum(thisYear))}원`} />
              <Stat label="미정산" value={`${unsettled}건`} sub={`전체 계약가 ${formatMoney(sum(sites))}원`} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="입금 합계" value={`${formatMoney(depositIn)}원`} tone="in" />
              <Stat label="출금 합계" value={`${formatMoney(depositOut)}원`} tone="out" />
              <Link href="/my-requests" className="block rounded-lg border border-zinc-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/40">
                <p className="text-xs text-zinc-500">승인 대기</p>
                <p className="mt-0.5 text-lg font-semibold text-zinc-900 tabular-nums">{pending}건</p>
              </Link>
              <Link
                href="/my-requests"
                className={`block rounded-lg border px-3 py-2.5 ${
                  rejected > 0 ? "border-red-300 bg-red-50 hover:bg-red-100" : "border-zinc-200 hover:border-blue-300 hover:bg-blue-50/40"
                }`}
              >
                <p className={`text-xs ${rejected > 0 ? "text-red-700" : "text-zinc-500"}`}>반려</p>
                <p className={`mt-0.5 text-lg font-semibold tabular-nums ${rejected > 0 ? "text-red-700" : "text-zinc-900"}`}>
                  {rejected}건
                </p>
              </Link>
            </div>

            <h3 className="mt-5 mb-2 text-xs font-semibold text-zinc-500">
              진행 중인 현장 {active.length > activeList.length && `(최근 ${activeList.length}건)`}
            </h3>
            {activeList.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">진행 중인 현장이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="border-b border-zinc-200 text-xs text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">현장번호</th>
                      <th className="px-2 py-1.5 text-left font-medium">고객명</th>
                      <th className="px-2 py-1.5 text-left font-medium">계약일</th>
                      <th className="px-2 py-1.5 text-right font-medium">계약가</th>
                      <th className="px-2 py-1.5 text-right font-medium">입금액</th>
                      <th className="px-2 py-1.5 text-left font-medium">정산</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {activeList.map((s) => (
                      <tr key={s.id}>
                        <td className="px-2 py-1.5 text-zinc-700 tabular-nums">{s.현장번호}</td>
                        <td className="px-2 py-1.5 text-zinc-900">{s.고객명 ?? "-"}</td>
                        <td className="px-2 py-1.5 text-zinc-500 tabular-nums">{s.계약일 ?? "-"}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-900 tabular-nums">{formatMoney(s.계약가)}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-700 tabular-nums">
                          {formatMoney(s.현장번호 ? (inBySite.get(s.현장번호) ?? 0) : 0)}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-500">{s.정산여부 ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "in" | "out" }) {
  const color = tone === "in" ? "text-emerald-700" : tone === "out" ? "text-red-600" : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold break-all tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400 tabular-nums">{sub}</p>}
    </div>
  );
}

const CARD = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5";
const CARD_TITLE = "mb-3 text-sm font-semibold text-zinc-900";

import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { fetchConsults } from "@/lib/consult";
import { exclusionFor } from "@/lib/excluded-users";
import {
  consultAgenda,
  formatDate,
  formatDateTime,
  formatManwon,
  formatYearMonth,
  isActiveStage,
  STAGE_TABS,
  stageBadge,
  type Consult,
  type StageTabKey,
} from "@/lib/consult-shared";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";

export const metadata = { title: "고객상담 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function ConsultPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">상담 목록을 불러오는 중…</p>}>
        <ConsultList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 연락이 밀린 상담: 진행 중이고 다음 연락일이 오늘이거나 지남 */
function contactDue(c: Consult, today: string): boolean {
  return isActiveStage(c.진행단계) && !!c.다음연락일 && c.다음연락일 <= today;
}

/** 오늘~7일 안의 예정(미정·예정·재조율) 일정 */
function upcoming(at: string | null, state: string, today: string, weekEnd: string): boolean {
  if (!at || state === "완료" || state === "취소") return false;
  const day = at.slice(0, 10);
  return today <= day && day <= weekEnd;
}

async function ConsultList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  if (!canUseConsult(session)) redirect("/"); // RD·관리자 이상만 (주소를 직접 입력해도 막음)
  const sp = await searchParams;
  // RD는 담당이 본인인 상담만, 관리자 이상은 전체
  const view = { ...(await exclusionFor(session.uid)), salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
  const tabKey = (STAGE_TABS.some((t) => t.key === one(sp.tab)) ? one(sp.tab) : "active") as StageTabKey;
  const tab = STAGE_TABS.find((t) => t.key === tabKey)!;
  const q = one(sp.q).trim();
  const focus = one(sp.focus); // today | due | meeting | measure

  const result = await fetchConsults(view).then(
    (rows) => ({ ok: true as const, rows }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">상담 목록을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }

  const today = todayInKorea();
  const weekEnd = addDays(today, 7);
  const all = result.rows;
  const todayCount = all.filter((c) => consultAgenda(c, today).length > 0).length;
  const dueCount = all.filter((c) => contactDue(c, today)).length;
  const meetingCount = all.filter((c) => upcoming(c.다음미팅일시, c.미팅상태, today, weekEnd)).length;
  const measureCount = all.filter((c) => upcoming(c.실측일시, c.실측상태, today, weekEnd)).length;

  const digits = q.replace(/\D/g, "");
  let rows = all.filter((c) => (tab.stages as readonly string[]).includes(c.진행단계));
  if (focus === "today") rows = all.filter((c) => consultAgenda(c, today).length > 0);
  if (focus === "due") rows = all.filter((c) => contactDue(c, today));
  if (focus === "meeting") rows = all.filter((c) => upcoming(c.다음미팅일시, c.미팅상태, today, weekEnd));
  if (focus === "measure") rows = all.filter((c) => upcoming(c.실측일시, c.실측상태, today, weekEnd));
  if (q) {
    rows = rows.filter(
      (c) =>
        c.고객명.includes(q) ||
        c.현장주소.includes(q) ||
        c.고객번호.includes(q) ||
        (c.영업사원 ?? "").includes(q) ||
        (digits.length >= 3 && c.연락처.replace(/\D/g, "").includes(digits)),
    );
  }
  // 연락이 밀린 상담을 맨 위로, 나머지는 최근 상담일 순 (서버에서 정렬된 순서 유지)
  rows = [...rows.filter((c) => contactDue(c, today)), ...rows.filter((c) => !contactDue(c, today))];

  const countOf = (stages: readonly string[]) => all.filter((c) => stages.includes(c.진행단계)).length;
  const href = (params: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return s ? `/consult?${s}` : "/consult";
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-zinc-900">고객상담</h1>
        <span className="text-sm text-zinc-500">{view.salesName ? `${view.salesName} 님 담당 고객` : "전체 고객"} {all.length}명</span>
        <Link
          href="/consult/new"
          className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + 새 상담
        </Link>
      </div>

      {/* 할 일 요약 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryLink href={href({ focus: "today" })} active={focus === "today"} label="오늘 할 일" count={todayCount} tone="red" hint="연락·미팅·실측·할 일" />
        <SummaryLink href={href({ focus: "due" })} active={focus === "due"} label="연락할 고객" count={dueCount} tone="red" hint="다음 연락일 오늘·지남" />
        <SummaryLink href={href({ focus: "meeting" })} active={focus === "meeting"} label="이번주 미팅" count={meetingCount} tone="blue" hint="오늘부터 7일" />
        <SummaryLink href={href({ focus: "measure" })} active={focus === "measure"} label="이번주 실측" count={measureCount} tone="violet" hint="오늘부터 7일" />
      </div>

      {focus ? (
        <p className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="font-medium">
            {focus === "today" ? "오늘 할 일이 있는 고객" : focus === "due" ? "연락할 고객" : focus === "meeting" ? "이번주 미팅" : "이번주 실측"} {rows.length}명
          </span>
          <Link href={href({ tab: tabKey === "active" ? "" : tabKey })} className="text-blue-600 hover:underline">
            × 전체 목록으로
          </Link>
        </p>
      ) : (
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="진행단계">
          {STAGE_TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key === "active" ? "" : t.key, q })}
              aria-current={t.key === tabKey ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                t.key === tabKey
                  ? "border-zinc-900 bg-zinc-900 font-semibold text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">{countOf(t.stages)}</span>
            </Link>
          ))}
        </nav>
      )}

      <form action="/consult" className="flex gap-2">
        {tabKey !== "active" && <input type="hidden" name="tab" value={tabKey} />}
        {focus && <input type="hidden" name="focus" value={focus} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="고객명·연락처·현장·고객번호·담당 RD"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button type="submit" className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          검색
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white py-12 text-center text-sm text-zinc-500">
          {all.length === 0 ? "아직 등록된 상담이 없습니다. '+ 새 상담'으로 시작하세요." : "조건에 맞는 상담이 없습니다."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <ConsultCard c={c} today={today} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryLink({
  href,
  active,
  label,
  count,
  tone,
  hint,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone: "red" | "blue" | "violet";
  hint: string;
}) {
  const color = count === 0 ? "text-zinc-400" : tone === "red" ? "text-red-600" : tone === "blue" ? "text-blue-600" : "text-violet-600";
  return (
    <Link
      href={href}
      className={`rounded-lg border bg-white px-3 py-2 hover:bg-zinc-50 ${active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"}`}
    >
      <span className="block text-xs text-zinc-500">{label}</span>
      <span className={`block text-xl font-bold tabular-nums ${color}`}>{count}</span>
      <span className="hidden text-[11px] text-zinc-400 sm:block">{hint}</span>
    </Link>
  );
}

function ConsultCard({ c, today }: { c: Consult; today: string }) {
  const due = contactDue(c, today);
  const overdueDays = due && c.다음연락일 ? Math.round((Date.parse(today) - Date.parse(c.다음연락일)) / 86_400_000) : 0;
  const nextTodo = c.할일.filter((t) => t.상태 !== "완료" && t.상태 !== "보류").sort((a, b) => (a.예정일 || "9").localeCompare(b.예정일 || "9"))[0];
  const meta = [
    c.평형 !== null ? `${c.평형}평` : "",
    c.예산 !== null ? `예산 ${formatManwon(c.예산)}` : "",
    c.전체공사 !== null ? `예상 ${formatManwon(c.전체공사)}` : "",
    c.시공예정월 ? `${formatYearMonth(c.시공예정월)} 시공` : "",
  ].filter(Boolean);

  return (
    <Link
      href={`/consult/${c.id}`}
      className={`block rounded-lg border bg-white px-4 py-3 hover:border-zinc-400 ${due ? "border-red-300 bg-red-50/40" : "border-zinc-200"}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-base font-semibold text-zinc-900">{c.고객명}</span>
        <span className="text-xs text-zinc-400 tabular-nums">{c.고객번호}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${stageBadge(c.진행단계)}`}>{c.진행단계}</span>
        <span className="ml-auto text-xs text-zinc-500">
          {c.영업사원 ?? "담당 미지정"} · 상담 {formatDate(c.상담일)}
        </span>
      </div>
      {(c.현장주소 || meta.length > 0) && (
        <p className="mt-1 text-sm text-zinc-700">
          {c.현장주소}
          {c.현장주소 && meta.length > 0 && <span className="text-zinc-300"> · </span>}
          <span className="text-zinc-500">{meta.join(" · ")}</span>
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {due && (
          <span className="font-semibold text-red-600">
            ⚠ 연락 {overdueDays === 0 ? "오늘" : `${overdueDays}일 지남`} ({formatDate(c.다음연락일)})
          </span>
        )}
        {!due && c.다음연락일 && <span className="text-zinc-600">다음 연락 {formatDate(c.다음연락일)}</span>}
        {c.다음미팅일시 && c.미팅상태 !== "완료" && c.미팅상태 !== "취소" && (
          <span className="text-blue-700">미팅 {formatDateTime(c.다음미팅일시)}</span>
        )}
        {c.실측일시 && c.실측상태 !== "완료" && c.실측상태 !== "취소" && (
          <span className="text-violet-700">실측 {formatDateTime(c.실측일시)}</span>
        )}
        {nextTodo && (
          <span className="text-zinc-600">
            할 일: {nextTodo.내용}
            {nextTodo.예정일 && ` (${formatDate(nextTodo.예정일)})`}
          </span>
        )}
        {c.최근연락일 && <span className="text-zinc-400">최근 연락 {formatDate(c.최근연락일)}</span>}
      </div>
    </Link>
  );
}

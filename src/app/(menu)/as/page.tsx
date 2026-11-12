import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { fetchAsCases } from "@/lib/as";
import { AS_TRADES, asCheckOf, tradesOf, checkBadge, isOpenCheck, urgencyBadge, type AsCase, type AsCheck } from "@/lib/as-shared";
import { requireUser } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { formatDate, formatDateTime } from "@/lib/consult-shared";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

export const metadata = { title: "A/S관리 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const TABS = [
  { key: "open", label: "진행중" },
  { key: "closed", label: "종결" },
  { key: "hold", label: "보류·취소" },
  { key: "all", label: "전체" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** 위쪽 요약 칸 = 확인 사항 필터 */
const FOCUS: { key: string; label: string; match: (c: AsCase, check: AsCheck) => boolean; tone: string }[] = [
  { key: "overdue", label: "기한 경과", match: (_, k) => k === "기한 경과", tone: "text-red-600" },
  { key: "confirm", label: "고객확인 필요", match: (_, k) => k === "고객확인 필요" || k === "완료일 확인", tone: "text-amber-600" },
  { key: "unscheduled", label: "일정 미등록", match: (_, k) => k === "일정 미등록", tone: "text-amber-600" },
  { key: "urgent", label: "긴급·우선", match: (c, k) => isOpenCheck(k) && k !== "보류" && (c.긴급도 === "긴급" || c.긴급도 === "우선"), tone: "text-red-600" },
];

export default function AsListPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">A/S 목록을 불러오는 중…</p>}>
        <AsList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function tabOf(check: AsCheck): TabKey {
  if (check === "종결") return "closed";
  if (check === "취소" || check === "보류") return "hold";
  return "open";
}

/** 급한 순서: 기한 경과 → 긴급 → 우선 → 나머지 (같으면 최근 접수 순) */
function priority(c: AsCase, check: AsCheck): number {
  if (check === "기한 경과") return 0;
  if (c.긴급도 === "긴급") return 1;
  if (c.긴급도 === "우선") return 2;
  return 3;
}

async function AsList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const session = await requireUser();
  if (!canUseConsult(session)) redirect("/"); // RD·관리자 이상만
  const sp = await searchParams;
  const view = { ...(await exclusionFor(session.uid)), salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
  const tabKey = (TABS.some((t) => t.key === one(sp.tab)) ? one(sp.tab) : "open") as TabKey;
  const focus = FOCUS.find((f) => f.key === one(sp.focus)) ?? null;
  const trade = (AS_TRADES as readonly string[]).includes(one(sp.trade)) ? one(sp.trade) : "";
  const q = one(sp.q).trim();

  const result = await fetchAsCases(view).then(
    (rows) => ({ ok: true as const, rows }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">A/S 목록을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }

  const today = todayInKorea();
  const all = result.rows.map((c) => ({ c, check: asCheckOf(c, today) }));
  const openCount = all.filter((x) => tabOf(x.check) === "open").length;
  const digits = q.replace(/\D/g, "");
  let rows = focus ? all.filter((x) => focus.match(x.c, x.check)) : all.filter((x) => tabKey === "all" || tabOf(x.check) === tabKey);
  if (trade) rows = rows.filter((x) => tradesOf(x.c.공종).includes(trade));
  if (q) {
    rows = rows.filter(({ c }) =>
      [c.접수번호, c.고객명, c.현장번호 ?? "", c.현장주소, c.고객요청, c.협력업체, c.담당자].some((v) => v.includes(q)) ||
      (digits.length >= 4 && c.연락처.replace(/\D/g, "").includes(digits)),
    );
  }
  rows = [...rows].sort((a, b) => priority(a.c, a.check) - priority(b.c, b.check));

  const href = (params: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return s ? `/as?${s}` : "/as";
  };
  const countOf = (key: TabKey) => (key === "all" ? all.length : all.filter((x) => tabOf(x.check) === key).length);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-zinc-900">A/S관리</h1>
        <span className="text-sm text-zinc-500">
          {view.salesName ? `${view.salesName} 님 현장` : "전체 현장"} · 미종결 {openCount}건
        </span>
        <Link href="/as/new" className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
          + A/S 접수
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FOCUS.map((f) => {
          const n = all.filter((x) => f.match(x.c, x.check)).length;
          const active = focus?.key === f.key;
          return (
            <Link
              key={f.key}
              href={href({ focus: f.key })}
              className={`rounded-lg border bg-white px-3 py-2 hover:bg-zinc-50 ${active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"}`}
            >
              <span className="block text-xs text-zinc-500">{f.label}</span>
              <span className={`block text-xl font-bold tabular-nums ${n ? f.tone : "text-zinc-400"}`}>{n}</span>
            </Link>
          );
        })}
      </div>

      {focus ? (
        <p className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="font-medium">
            {focus.label} {rows.length}건
          </span>
          <Link href="/as" className="text-blue-600 hover:underline">
            × 전체 목록으로
          </Link>
        </p>
      ) : (
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="진행 구분">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key === "open" ? "" : t.key, trade, q })}
              aria-current={t.key === tabKey ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                t.key === tabKey ? "border-zinc-900 bg-zinc-900 font-semibold text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">{countOf(t.key)}</span>
            </Link>
          ))}
        </nav>
      )}

      <form action="/as" className="flex flex-wrap gap-2">
        {tabKey !== "open" && <input type="hidden" name="tab" value={tabKey} />}
        {focus && <input type="hidden" name="focus" value={focus.key} />}
        <select
          name="trade"
          defaultValue={trade}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500"
          aria-label="공종"
        >
          <option value="">공종 전체</option>
          {AS_TRADES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="접수번호·고객명·현장·증상·협력업체·연락처"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button type="submit" className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          검색
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white py-12 text-center text-sm text-zinc-500">
          {all.length === 0 ? "아직 접수된 A/S가 없습니다. '+ A/S 접수'로 시작하세요." : "조건에 맞는 A/S가 없습니다."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ c, check }) => (
            <li key={c.id}>
              <AsCard c={c} check={check} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AsCard({ c, check }: { c: AsCase; check: AsCheck }) {
  const alert = check === "기한 경과" || (isOpenCheck(check) && c.긴급도 === "긴급");
  return (
    <Link
      href={`/as/${c.id}`}
      className={`block rounded-lg border bg-white px-4 py-3 hover:border-zinc-400 ${alert ? "border-red-300 bg-red-50/40" : "border-zinc-200"}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs text-zinc-400 tabular-nums">{c.접수번호}</span>
        <span className="text-base font-semibold text-zinc-900">{c.고객명}</span>
        {c.긴급도 !== "일반" && <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${urgencyBadge(c.긴급도)}`}>{c.긴급도}</span>}
        {c.공종 && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700">{c.공종}</span>}
        <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-700">{c.진행상태}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${checkBadge(check)}`}>{check}</span>
        <span className="ml-auto text-xs text-zinc-500">
          {c.담당자 || "담당 미지정"} · 접수 {formatDate(c.접수일)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-zinc-800">{c.고객요청 || <span className="text-zinc-400">(증상 미입력)</span>}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
        {c.현장주소 && <span className="truncate">{c.현장주소}</span>}
        {c.협력업체 && <span>🔧 {c.협력업체.split("\n")[0]}</span>}
        {c.방문예정일시 && <span className="text-blue-700">방문 {formatDateTime(c.방문예정일시)}</span>}
        {c.처리기한 && <span className={check === "기한 경과" ? "font-semibold text-red-600" : ""}>기한 {formatDate(c.처리기한)}</span>}
      </div>
    </Link>
  );
}

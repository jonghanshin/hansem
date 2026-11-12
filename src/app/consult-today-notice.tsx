import Link from "next/link";

import { getSession } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { fetchConsultAgendaRows, type ConsultAgendaRow } from "@/lib/consult";
import { consultAgenda, formatDateTime, type AgendaItem } from "@/lib/consult-shared";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

// 고객상담 '오늘 할 일' 알림: 오늘·지난 연락, 오늘 미팅·실측, 예정일이 오늘·지난 할 일.
// 상단 메뉴(nav)에는 건수, 첫 화면(banner)에는 목록. 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다.

const ICON: Record<AgendaItem["kind"], string> = { 연락: "📞", 미팅: "🤝", 실측: "📐", 할일: "✅" };
const BANNER_MAX = 6;

async function loadAgenda(): Promise<{ c: ConsultAgendaRow; a: AgendaItem }[] | null> {
  const session = await getSession();
  if (!session || session.mustChangePassword || !canUseConsult(session)) return null;
  const view = { ...(await exclusionFor(session.uid)), salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
  const consults = await fetchConsultAgendaRows(view);
  const today = todayInKorea();
  return consults
    .flatMap((c) => consultAgenda(c, today).map((a) => ({ c, a })))
    .sort((x, y) => Number(y.a.overdue) - Number(x.a.overdue) || x.a.when.localeCompare(y.a.when));
}

export async function ConsultTodayNotice({ variant }: { variant: "nav" | "banner" }) {
  // 조회에 실패하면 알림만 생략한다 (메뉴 바·첫 화면은 그대로)
  const items = await loadAgenda().catch(() => null);
  if (!items || items.length === 0) return null;
  const overdue = items.filter((x) => x.a.overdue).length;

  if (variant === "nav") {
    return (
      <Link
        href="/consult?focus=today"
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-semibold ${
          overdue ? "bg-red-500 text-white hover:bg-red-400" : "bg-sky-400 text-zinc-900 hover:bg-sky-300"
        }`}
        title={`고객상담 오늘 할 일 ${items.length}건${overdue ? ` (지난 일 ${overdue}건)` : ""}`}
      >
        오늘<span className="hidden sm:inline"> 상담</span>
        <span className="rounded-full bg-zinc-900 px-1.5 text-xs text-white tabular-nums">{items.length}</span>
      </Link>
    );
  }

  return (
    <section className="mt-6 rounded-xl border border-sky-300 bg-sky-50 px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-sky-950">
          고객상담 오늘 할 일 {items.length}건
          {overdue > 0 && <span className="ml-1.5 text-sm font-medium text-red-600">(지난 일 {overdue}건)</span>}
        </h2>
        <Link href="/consult?focus=today" className="shrink-0 text-sm font-semibold text-sky-800 hover:underline">
          모두 보기 →
        </Link>
      </div>
      <ul className="mt-2 space-y-1">
        {items.slice(0, BANNER_MAX).map(({ c, a }, i) => (
          <li key={`${c.id}-${i}`}>
            <Link href={`/consult/${c.id}`} className="flex items-baseline gap-2 rounded px-1 py-0.5 text-sm hover:bg-sky-100">
              <span aria-hidden>{ICON[a.kind]}</span>
              <span className="shrink-0 font-semibold text-zinc-900">{c.고객명}</span>
              <span className="min-w-0 truncate text-zinc-700">{a.kind === "할일" ? a.label : a.kind}</span>
              <span className={`ml-auto shrink-0 text-xs tabular-nums ${a.overdue ? "font-semibold text-red-600" : "text-zinc-500"}`}>
                {a.overdue ? `${formatDateTime(a.when)} 지남` : a.when.length > 10 ? a.when.slice(11, 16) : "오늘"}
              </span>
            </Link>
          </li>
        ))}
        {items.length > BANNER_MAX && <li className="px-1 text-xs text-sky-800">외 {items.length - BANNER_MAX}건</li>}
      </ul>
    </section>
  );
}

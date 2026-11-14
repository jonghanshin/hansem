import Link from "next/link";

import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/consult-shared";
import { countUnreadNotices, fetchNotices, type Notice } from "@/lib/notices";

// 담당자 지정 알림: 상단 메뉴(nav)에는 안 읽은 건수, 첫 화면(banner)에는 목록.
// 항목을 누르면 /notices/[id]에서 읽음 처리 후 해당 상담·A/S로 이동한다. 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다.

const BANNER_MAX = 5;
export const NOTICE_ICON: Record<Notice["kind"], string> = { 고객상담: "💬", "A/S": "🛠️" };

export async function AssignNotice({ variant }: { variant: "nav" | "banner" }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return null;

  if (variant === "nav") {
    const count = await countUnreadNotices(session.uid).catch(() => 0);
    if (count === 0) return null;
    return (
      <Link
        href="/notices"
        className="flex items-center gap-1.5 rounded bg-rose-500 px-2.5 py-1 text-sm font-semibold text-white hover:bg-rose-400"
        title={`새 담당·일정 알림 ${count}건`}
      >
        알림
        <span className="rounded-full bg-zinc-900 px-1.5 text-xs text-white tabular-nums">{count}</span>
      </Link>
    );
  }

  const items = await fetchNotices(session.uid, { unreadOnly: true, limit: BANNER_MAX + 1 }).catch(() => []);
  if (items.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-rose-950">새 담당·일정 알림이 있습니다</h2>
        <Link href="/notices" className="shrink-0 text-sm font-semibold text-rose-800 hover:underline">
          모두 보기 →
        </Link>
      </div>
      <ul className="mt-2 space-y-1">
        {items.slice(0, BANNER_MAX).map((n) => (
          <li key={n.id}>
            <Link href={`/notices/${n.id}`} className="flex items-baseline gap-2 rounded px-1 py-0.5 text-sm hover:bg-rose-100">
              <span aria-hidden>{NOTICE_ICON[n.kind]}</span>
              <span className="min-w-0 truncate text-zinc-800">{n.message}</span>
              <span className="ml-auto shrink-0 text-xs text-zinc-500 tabular-nums">{formatDateTime(toKorea(n.createdAt))}</span>
            </Link>
          </li>
        ))}
        {items.length > BANNER_MAX && <li className="px-1 text-xs text-rose-800">더 있습니다</li>}
      </ul>
    </section>
  );
}

/** timestamptz → 한국 시간 "YYYY-MM-DDTHH:MM" */
export function toKorea(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16).replace(" ", "T");
}

import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { NOTICE_ICON, toKorea } from "@/app/assign-notice";
import { readAllNoticesAction } from "@/app/notice-actions";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/consult-shared";
import { fetchNotices } from "@/lib/notices";

export const metadata = { title: "알림 | 현장정보 관리" };

export default function NoticesPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">알림을 불러오는 중…</p>}>
        <Notices />
      </Suspense>
    </main>
  );
}

async function Notices() {
  await connection();
  const session = await requireUser();
  const result = await fetchNotices(session.uid).then(
    (items) => ({ ok: true as const, items }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">알림을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  const { items } = result;
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">알림</h1>
          <p className="mt-1 text-sm text-zinc-500">고객상담·A/S 담당 지정과 맡은 일정의 등록·변경 내역입니다 (최근 100건).</p>
        </div>
        {unread > 0 && (
          <form action={readAllNoticesAction}>
            <button className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
              모두 읽음 ({unread})
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">알림이 없습니다.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={`/notices/${n.id}`}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 ${n.read ? "text-zinc-500" : "bg-rose-50/60 text-zinc-900"}`}
              >
                <span aria-hidden className="mt-0.5">
                  {NOTICE_ICON[n.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>{n.message}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {n.kind}
                    {n.by && ` · 지정: ${n.by}`} · {formatDateTime(toKorea(n.createdAt))}
                  </span>
                </span>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-500" aria-label="안 읽음" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

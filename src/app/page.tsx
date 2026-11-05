import Link from "next/link";
import { Suspense } from "react";

import { MENU } from "@/app/menu";
import { PendingApprovalsNotice } from "@/app/pending-approvals-notice";
import { UserMenu } from "@/app/user-menu";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">현장정보 관리</h1>
            <p className="mt-1 text-sm text-zinc-500">메뉴를 선택하세요.</p>
          </div>
          <Suspense fallback={null}>
            <UserMenu tone="light" />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <PendingApprovalsNotice variant="banner" />
        </Suspense>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {MENU.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="group flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <span className="text-lg font-semibold text-zinc-900 group-hover:text-blue-700">{m.label}</span>
                <span className="mt-2 text-sm text-zinc-500">{m.description}</span>
                <span className="mt-6 text-sm font-medium text-blue-600">열기 →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

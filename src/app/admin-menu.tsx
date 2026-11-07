import Link from "next/link";

import { NavMenuLinks } from "@/app/(menu)/menu-nav";
import { ADMIN_MENU } from "@/app/menu";
import { getSession } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/data-scope";

// 슈퍼관리자 전용 메뉴(대시보드). 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다.

async function isAdmin() {
  return isSuperAdmin(await getSession());
}

/** 상단 메뉴 바의 관리자 메뉴 링크 */
export async function AdminNavLinks() {
  if (!(await isAdmin())) return null;
  return <NavMenuLinks items={ADMIN_MENU} />;
}

/** 첫 화면의 관리자 메뉴 카드 */
export async function AdminMenuCards() {
  if (!(await isAdmin())) return null;
  return ADMIN_MENU.map((m) => (
    <li key={m.href}>
      <Link
        href={m.href}
        className="group flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-zinc-900 group-hover:text-blue-700">
          {m.label}
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">슈퍼관리자</span>
        </span>
        <span className="mt-2 text-sm text-zinc-500">{m.description}</span>
        <span className="mt-6 text-sm font-medium text-blue-600">열기 →</span>
      </Link>
    </li>
  ));
}

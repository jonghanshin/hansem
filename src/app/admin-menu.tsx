import Link from "next/link";

import { NavMenuLinks } from "@/app/(menu)/menu-nav";
import { ADMIN_MENU, MANAGER_MENU } from "@/app/menu";
import { getSession } from "@/lib/auth";
import { canApprove, isSuperAdmin } from "@/lib/data-scope";
import { hasActiveRdPublish } from "@/lib/rd-publish";

// 역할별 메뉴 (정산: 관리자 이상 + RD게시 기간 중인 RD, 급여: 관리자 이상, 대시보드: 슈퍼관리자). 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다.

async function roleMenus() {
  const session = await getSession();
  const manager = canApprove(session);
  // RD는 관리자가 게시한 기간 동안만 정산 메뉴를 본다
  const rdPublished = !manager && (await hasActiveRdPublish(session));
  return [
    ...(manager ? MANAGER_MENU.map((m) => ({ ...m, badge: "관리자" })) : []),
    ...(rdPublished
      ? MANAGER_MENU.filter((m) => m.href === "/settlement").map((m) => ({
          ...m,
          description: "관리자가 게시한 정산월의 내 현장 정산 내역",
          badge: "게시",
        }))
      : []),
    ...(isSuperAdmin(session) ? ADMIN_MENU.map((m) => ({ ...m, badge: "슈퍼관리자" })) : []),
  ];
}

/** 상단 메뉴 바의 역할별 메뉴 링크 */
export async function AdminNavLinks() {
  const items = await roleMenus();
  if (items.length === 0) return null;
  return <NavMenuLinks items={items} />;
}

/** 첫 화면의 역할별 메뉴 카드 */
export async function AdminMenuCards() {
  return (await roleMenus()).map((m) => (
    <li key={m.href}>
      <Link
        href={m.href}
        className="group flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-zinc-900 group-hover:text-blue-700">
          {m.label}
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{m.badge}</span>
        </span>
        <span className="mt-2 text-sm text-zinc-500">{m.description}</span>
        <span className="mt-6 text-sm font-medium text-blue-600">열기 →</span>
      </Link>
    </li>
  ));
}

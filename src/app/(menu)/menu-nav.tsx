"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { MENU } from "@/app/menu";

export function MenuNav({ userSlot }: { userSlot?: React.ReactNode }) {
  return (
    <nav className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-1 bg-zinc-900 px-3 sm:px-5" aria-label="주 메뉴">
      <Link href="/" className="mr-3 rounded px-2 py-1 text-sm font-semibold text-white hover:bg-white/10">
        홈
      </Link>
      {/* 현재 주소(usePathname)는 요청 시점에만 알 수 있으므로 Suspense 안에서 읽는다 (동적 경로 /board/[id] 등) */}
      <Suspense fallback={<MenuLinks pathname={null} />}>
        <ActiveMenuLinks />
      </Suspense>
      <div className="ml-auto flex items-center gap-2">{userSlot}</div>
    </nav>
  );
}

function ActiveMenuLinks() {
  return <MenuLinks pathname={usePathname()} />;
}

function MenuLinks({ pathname }: { pathname: string | null }) {
  return MENU.map((m) => {
    const active = pathname !== null && (pathname === m.href || pathname.startsWith(`${m.href}/`));
    return (
      <Link
        key={m.href}
        href={m.href}
        aria-current={active ? "page" : undefined}
        className={`rounded px-3 py-1 text-sm font-medium ${
          active ? "bg-white text-zinc-900" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        {m.label}
      </Link>
    );
  });
}

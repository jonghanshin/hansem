"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MENU } from "@/app/menu";

export function MenuNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-1 bg-zinc-900 px-3 sm:px-5" aria-label="주 메뉴">
      <Link href="/" className="mr-3 rounded px-2 py-1 text-sm font-semibold text-white hover:bg-white/10">
        홈
      </Link>
      {MENU.map((m) => {
        const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
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
      })}
    </nav>
  );
}

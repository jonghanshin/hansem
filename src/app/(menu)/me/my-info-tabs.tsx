import Link from "next/link";

/** 나의정보 하위 메뉴: 나의정보 / 근태관리 */
export function MyInfoTabs({ active }: { active: "me" | "attendance" }) {
  const tabs = [
    { key: "me", href: "/me", label: "나의정보" },
    { key: "attendance", href: "/me/attendance", label: "근태관리" },
  ] as const;
  return (
    <div className="flex gap-1 border-b border-zinc-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
            active === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

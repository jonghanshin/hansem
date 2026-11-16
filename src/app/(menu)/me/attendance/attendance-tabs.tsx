import Link from "next/link";

/** 근태관리 하위 메뉴: 내 출퇴근 / 팀원 출근현황 */
export function AttendanceTabs({ active }: { active: "mine" | "team" }) {
  const tabs = [
    { key: "mine", href: "/me/attendance", label: "내 출퇴근" },
    { key: "team", href: "/me/attendance/team", label: "팀원 출근현황" },
  ] as const;
  return (
    <div className="flex gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            active === t.key ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

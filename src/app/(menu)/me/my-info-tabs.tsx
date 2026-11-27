import Link from "next/link";
import { Suspense } from "react";

import { getSession } from "@/lib/auth";
import { canViewPayslips } from "@/lib/payroll";

type TabKey = "me" | "attendance" | "payslips";

/** 나의정보 하위 메뉴: 나의정보 / 근태관리 / 급여명세서 (급여명세서는 권한.월급명세가 Y인 사용자만) */
export function MyInfoTabs({ active }: { active: TabKey }) {
  return (
    <div className="flex gap-1 border-b border-zinc-200">
      <Tab href="/me" label="나의정보" active={active === "me"} />
      <Tab href="/me/attendance" label="근태관리" active={active === "attendance"} />
      {active === "payslips" ? (
        <Tab href="/me/payslips" label="급여명세서" active />
      ) : (
        // 쿠키·권한 테이블을 읽으므로 Suspense 안에서 렌더링한다
        <Suspense fallback={null}>
          <PayslipTab />
        </Suspense>
      )}
    </div>
  );
}

async function PayslipTab() {
  const session = await getSession();
  if (!session || !(await canViewPayslips(session.uid))) return null;
  return <Tab href="/me/payslips" label="급여명세서" active={false} />;
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {label}
    </Link>
  );
}

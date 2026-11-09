import Link from "next/link";

import { countPendingRequests, countRejectedRequests } from "@/lib/approvals";
import { getSession } from "@/lib/auth";
import { canApprove, RESTRICTED_ROLE, scopeFor } from "@/lib/data-scope";

/**
 * 승인 대기 알림. 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다.
 * - 승인 권한자(CEO·관리자): 전체 승인 대기 건수 → 승인 화면(/approvals)
 * - RD: 본인이 요청한 승인 대기 건수 + 반려 건수 → 내 요청 화면(/my-requests)
 */
export async function PendingApprovalsNotice({ variant }: { variant: "nav" | "banner" }) {
  const session = await getSession();
  if (!session) return null;

  if (canApprove(session)) {
    const count = await countPendingRequests(scopeFor(session)).catch(() => 0);
    if (count === 0) return null;
    return variant === "nav" ? (
      <NavLink href="/approvals" highlight count={count}>
        승인<span className="hidden sm:inline"> 필요</span>
      </NavLink>
    ) : (
      <Banner href="/approvals" title={`승인이 필요한 입금내역이 ${count}건 있습니다.`} hint="눌러서 내역을 확인하고 승인하세요." action="승인하기 →" />
    );
  }

  if (session.role.trim() === RESTRICTED_ROLE) {
    const [count, rejected] = await Promise.all([
      countPendingRequests(scopeFor(session), session.uid).catch(() => 0),
      countRejectedRequests(session.uid).catch(() => 0),
    ]);
    // 메뉴의 '내 요청'은 항상 보여 주고, 첫 화면 배너는 대기·반려 건이 있을 때만
    if (variant === "nav") {
      return (
        <>
          {rejected > 0 && (
            <NavLink href="/my-requests" highlight tone="red" count={rejected}>
              반려
            </NavLink>
          )}
          <NavLink href="/my-requests" highlight={count > 0} count={count}>
            내 요청
          </NavLink>
        </>
      );
    }
    if (count === 0 && rejected === 0) return null;
    return (
      <>
        {rejected > 0 && (
          <Banner
            href="/my-requests"
            tone="red"
            title={`반려된 내 요청이 ${rejected}건 있습니다.`}
            hint="관리자 의견을 확인하고 고쳐서 다시 요청하세요."
            action="반려 내역 보기 →"
          />
        )}
        {count > 0 && (
          <Banner
            href="/my-requests"
            title={`승인을 기다리는 내 요청이 ${count}건 있습니다.`}
            hint="눌러서 승인 대기 중인 내역을 확인하세요."
            action="내 요청 보기 →"
          />
        )}
      </>
    );
  }

  return null;
}

function NavLink({
  href,
  highlight,
  tone = "amber",
  count,
  children,
}: {
  href: string;
  highlight: boolean;
  tone?: "amber" | "red";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-semibold ${
        highlight
          ? tone === "red"
            ? "bg-red-500 text-white hover:bg-red-400"
            : "bg-amber-400 text-zinc-900 hover:bg-amber-300"
          : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
      {count > 0 && <span className="rounded-full bg-zinc-900 px-1.5 text-xs text-white tabular-nums">{count}</span>}
    </Link>
  );
}

function Banner({
  href,
  title,
  hint,
  action,
  tone = "amber",
}: {
  href: string;
  title: string;
  hint: string;
  action: string;
  tone?: "amber" | "red";
}) {
  return (
    <Link
      href={href}
      className={`mt-6 flex items-center justify-between gap-3 rounded-xl border px-5 py-4 shadow-sm ${
        tone === "red"
          ? "border-red-300 bg-red-50 text-red-900 hover:border-red-400 hover:bg-red-100"
          : "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100"
      }`}
    >
      <span>
        <span className="font-semibold">{title}</span>
        <span className={`mt-0.5 block text-sm ${tone === "red" ? "text-red-800" : "text-amber-800"}`}>{hint}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold">{action}</span>
    </Link>
  );
}

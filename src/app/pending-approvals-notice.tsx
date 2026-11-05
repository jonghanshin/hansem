import Link from "next/link";

import { countPendingRequests } from "@/lib/approvals";
import { getSession } from "@/lib/auth";
import { canApprove } from "@/lib/data-scope";

/**
 * CEO에게만: 승인 대기 입금내역이 있으면 건수를 보여주고 승인 화면으로 연결한다.
 * 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다.
 */
export async function PendingApprovalsNotice({ variant }: { variant: "nav" | "banner" }) {
  const session = await getSession();
  if (!canApprove(session)) return null;
  const count = await countPendingRequests().catch(() => 0);
  if (count === 0) return null;

  if (variant === "nav") {
    return (
      <Link
        href="/approvals"
        className="flex items-center gap-1.5 rounded bg-amber-400 px-2.5 py-1 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
      >
        승인<span className="hidden sm:inline"> 필요</span> <span className="rounded-full bg-zinc-900 px-1.5 text-xs text-white tabular-nums">{count}</span>
      </Link>
    );
  }
  return (
    <Link
      href="/approvals"
      className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm hover:border-amber-400 hover:bg-amber-100"
    >
      <span>
        <span className="font-semibold">승인이 필요한 입금내역이 {count}건 있습니다.</span>
        <span className="mt-0.5 block text-sm text-amber-800">눌러서 내역을 확인하고 승인하세요.</span>
      </span>
      <span className="shrink-0 text-sm font-semibold">승인하기 →</span>
    </Link>
  );
}

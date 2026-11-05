import { Suspense } from "react";

import { ApprovalsTable } from "@/app/(menu)/approvals/approvals-table";
import { fetchPendingRequests, STATUS_PENDING, STATUS_REJECTED } from "@/lib/approvals";
import { requireUser } from "@/lib/auth";
import { canApprove, scopeFor } from "@/lib/data-scope";
import { fetchSiteSummaries } from "@/lib/sites-data";

export const metadata = { title: "내 승인 요청 | 현장정보 관리" };

// RD가 요청한 입금 등록·수정·삭제 중 '승인대기'(보기 전용)와 '반려'(관리자 의견 확인 후 고쳐 다시 요청) 내역
export default function MyRequestsPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">내 요청을 불러오는 중…</p>}>
        <MyRequestsLoader />
      </Suspense>
    </main>
  );
}

async function MyRequestsLoader() {
  const session = await requireUser();
  const scope = scopeFor(session);
  // 로그인한 사람이 요청한 건만 (권한.id = 승인필요입금내역.요청자)
  const result = await Promise.all([
    fetchPendingRequests(session.uid, [STATUS_PENDING, STATUS_REJECTED]),
    fetchSiteSummaries(scope),
  ]).then(
    ([rows, sites]) => ({ ok: true as const, rows, sites }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">내 요청을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  return (
    <ApprovalsTable
      rows={result.rows}
      mode="mine"
      sites={result.sites}
      loginName={session.name}
      fixedSalesName={scope.salesName}
      canDelete={canApprove(session)}
    />
  );
}

import { Suspense } from "react";

import { ApprovalsTable } from "@/app/(menu)/approvals/approvals-table";
import { fetchPendingRequests } from "@/lib/approvals";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "내 승인 요청 | 현장정보 관리" };

// RD가 요청한 입금 등록·수정·삭제 중 아직 '승인대기'인 내역 (보기 전용)
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
  // 로그인한 사람이 요청한 건만 (권한.id = 승인필요입금내역.요청자)
  const result = await fetchPendingRequests(session.uid).then(
    (rows) => ({ ok: true as const, rows }),
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
  return <ApprovalsTable rows={result.rows} mode="mine" />;
}

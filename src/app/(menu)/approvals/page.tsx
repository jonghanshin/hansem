import { redirect } from "next/navigation";
import { Suspense } from "react";

import { fetchPendingRequests } from "@/lib/approvals";
import { requireUser } from "@/lib/auth";
import { canApprove, scopeFor } from "@/lib/data-scope";

import { ApprovalsTable } from "./approvals-table";

export const metadata = { title: "입금 승인 | 현장정보 관리" };

export default function ApprovalsPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">승인 대기 내역을 불러오는 중…</p>}>
        <ApprovalsLoader />
      </Suspense>
    </main>
  );
}

async function ApprovalsLoader() {
  const session = await requireUser();
  if (!canApprove(session)) redirect("/"); // 승인 권한(CEO·관리자)이 있는 사용자만 볼 수 있다
  const result = await fetchPendingRequests(scopeFor(session)).then(
    (rows) => ({ ok: true as const, rows }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">승인 대기 내역을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  return <ApprovalsTable rows={result.rows} />;
}

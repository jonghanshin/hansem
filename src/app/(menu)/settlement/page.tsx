import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { canApprove, scopeFor } from "@/lib/data-scope";
import { fetchSettlementCandidates } from "@/lib/settlement";

import { SettlementView } from "./settlement-view";

export const metadata = { title: "정산 | 현장정보 관리" };

export default function SettlementPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">미정산 현장을 불러오는 중…</p>}>
        <SettlementLoader />
      </Suspense>
    </main>
  );
}

async function SettlementLoader() {
  await connection(); // 항상 요청 시점의 최신 데이터를 읽는다
  const session = await requireUser();
  if (!canApprove(session)) redirect("/"); // 관리자 이상만 (주소를 직접 입력해도 막음)
  const result = await fetchSettlementCandidates(scopeFor(session)).then(
    (rows) => ({ ok: true as const, rows }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">미정산 현장을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  return <SettlementView sites={result.rows} />;
}

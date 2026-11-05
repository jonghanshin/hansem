import { connection } from "next/server";
import { Suspense } from "react";

import { fetchAllDeposits, fetchSiteSummaries } from "@/lib/sites-data";

import { DepositsTable } from "./deposits-table";

export const metadata = { title: "입금내역 | 현장정보 관리" };

export default function DepositsPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col bg-zinc-50">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">입금내역을 불러오는 중…</p>}>
        <DepositsLoader />
      </Suspense>
    </main>
  );
}

async function DepositsLoader() {
  await connection(); // 항상 요청 시점의 최신 데이터를 읽는다
  const result = await Promise.all([fetchAllDeposits(), fetchSiteSummaries()]).then(
    ([deposits, sites]) => ({ ok: true as const, deposits, sites }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">입금내역을 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  return <DepositsTable initialDeposits={result.deposits} sites={result.sites} />;
}

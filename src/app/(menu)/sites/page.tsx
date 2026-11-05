import { connection } from "next/server";
import { Suspense } from "react";

import { SitesManager } from "@/app/sites-manager";
import { fetchSites } from "@/lib/sites-data";

export const metadata = { title: "현장정보 | 현장정보 관리" };

export default function SitesPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">현장정보를 불러오는 중…</p>}>
        <SitesLoader />
      </Suspense>
    </main>
  );
}

async function SitesLoader() {
  await connection(); // 항상 요청 시점의 최신 데이터를 읽는다
  const result = await fetchSites().then(
    (sites) => ({ ok: true as const, sites }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">현장정보를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  return <SitesManager initialSites={result.sites} />;
}

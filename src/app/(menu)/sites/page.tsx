import { connection } from "next/server";
import { Suspense } from "react";

import { lookupSalesperson, requireUser, resolveScope } from "@/lib/auth";
import { SitesManager } from "@/app/sites-manager";
import { fetchConsultIdsBySite } from "@/lib/consult";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";
import { fetchSites } from "@/lib/sites-data";

export const metadata = { title: "현장정보 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function SitesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">현장정보를 불러오는 중…</p>}>
        <SitesLoader searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SitesLoader({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // 항상 요청 시점의 최신 데이터를 읽는다
  const session = await requireUser(); // 로그인 확인
  const scope = await resolveScope(session); // RD는 본인 데이터만
  const siteParam = (await searchParams).site;
  const wantedNumber = (Array.isArray(siteParam) ? siteParam[0] : siteParam)?.trim() ?? "";
  // 고객상담과 연결된 현장 ('상담노트 보기' 링크). 실패해도 현장 화면은 보여준다
  const consultIds = canUseConsult(session)
    ? await fetchConsultIdsBySite({
        ...(await exclusionFor(session.uid)),
        salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null,
      }).catch(() => ({}))
    : {};
  // 새 현장의 영업사원·영업사원ID: 로그인한 영업사원ID로 권한 테이블에서 찾는다
  const result = await Promise.all([fetchSites(scope), lookupSalesperson(session.sid)]).then(
    ([sites, salesperson]) => ({ ok: true as const, sites, salesperson }),
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
  return (
    <SitesManager
      key={scope.salesName ?? "*"}
      initialSites={result.sites}
      fixedSalesName={scope.salesName}
      newSiteSales={result.salesperson ?? { 영업사원ID: session.sid, 영업사원: null }}
      initialSiteId={wantedNumber ? (result.sites.find((s) => s.현장번호?.trim() === wantedNumber)?.id ?? null) : null}
      consultIds={consultIds}
    />
  );
}

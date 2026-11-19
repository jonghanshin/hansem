import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser, resolveScope } from "@/lib/auth";
import { canApprove } from "@/lib/data-scope";
import { fetchActiveRdPublish } from "@/lib/rd-publish";
import { fetchSettlementCandidates } from "@/lib/settlement";
import { currentRatesFor } from "@/lib/settlement-account";
import { summarizeSettlement } from "@/lib/settlement-calc";

import { RdSettlementView, SettlementView } from "./settlement-view";

export const metadata = { title: "정산 | 현장정보 관리" };

export default function SettlementPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">정산 정보를 불러오는 중…</p>}>
        <SettlementLoader />
      </Suspense>
    </main>
  );
}

function LoadError({ title, message }: { title: string; message: string }) {
  return (
    <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 whitespace-pre-line">{message}</p>
    </div>
  );
}

async function SettlementLoader() {
  await connection(); // 항상 요청 시점의 최신 데이터를 읽는다
  const session = await requireUser();

  // RD는 관리자가 게시한 기간 동안만, 게시된 정산결과를 본다 (주소를 직접 입력해도 막음)
  if (!canApprove(session)) {
    const publish = await fetchActiveRdPublish(session).catch(() => null);
    if (!publish) redirect("/");
    if (!publish.결과) return <LoadError title="게시된 정산결과가 없습니다" message="관리자에게 다시 게시해 달라고 요청하세요." />;
    // 정산금액은 서버에서 권한 테이블의 현재 비율로 계산한다 (게시 후 관리자가 비율을 바꿔도 반영).
    // RD에게는 계산 결과와 적용 비율 설명만 넘긴다 (비율 수정·공식은 관리자 화면에만).
    const rates = await currentRatesFor(publish.영업사원ID, publish.영업사원).catch(() => publish.결과?.rates ?? undefined);
    const summary = summarizeSettlement(publish.결과.lines, publish.결과.carryIn?.금액 ?? 0, rates);
    return (
      <RdSettlementView
        영업사원={publish.영업사원}
        정산월={publish.정산월}
        시작일={publish.시작일}
        종료일={publish.종료일}
        result={{ ...publish.결과, rates: null }}
        summary={summary}
        rates={rates ? { upTo5m: rates.upTo5m, upTo10m: rates.upTo10m, over10m: rates.over10m } : null}
      />
    );
  }

  const result = await fetchSettlementCandidates(await resolveScope(session)).then(
    (rows) => ({ ok: true as const, rows }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) return <LoadError title="미정산 현장을 불러오지 못했습니다" message={result.error} />;
  return <SettlementView sites={result.rows} />;
}

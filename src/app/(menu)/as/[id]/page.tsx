import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { fetchAsCase, fetchAsHistories, fetchAsMembers, fetchRelatedAs } from "@/lib/as";
import { requireUser } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { canApprove, canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

import { AsForm } from "../as-form";
import { AsHistoryPanel } from "../as-history";
import { AsPhotos } from "../as-photos";

export const metadata = { title: "A/S 상세노트 | A/S관리" };

type Params = Promise<{ id: string }>;

export default function AsDetailPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">A/S 상세노트를 불러오는 중…</p>}>
        <AsDetail params={params} />
      </Suspense>
    </main>
  );
}

async function AsDetail({ params }: { params: Params }) {
  await connection();
  const session = await requireUser();
  if (!canUseConsult(session)) redirect("/"); // RD·관리자 이상만
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return <Missing />;

  const exclusion = await exclusionFor(session.uid);
  // RD는 담당 RD가 본인인 A/S만, 관리자 이상은 전체
  const view = { ...exclusion, salesName: session.role.trim() === RESTRICTED_ROLE ? session.name : null };
  const result = await fetchAsCase(id, view)
    .then(async (c) => {
      if (!c) return { ok: true as const, c: null };
      const [history, members, related] = await Promise.all([fetchAsHistories(id, exclusion), fetchAsMembers(exclusion), fetchRelatedAs(c, view)]);
      return { ok: true as const, c, history, members, related };
    })
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">A/S 상세노트를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  if (!result.c) return <Missing />;
  const { c, history, members, related } = result;
  const canManage = canApprove(session);

  return (
    <AsForm
      c={c}
      members={members}
      today={todayInKorea()}
      related={related.map((r) => ({ id: r.id, 접수번호: r.접수번호, 접수일: r.접수일, 공종: r.공종, 고객요청: r.고객요청, 진행상태: r.진행상태 }))}
      historyCount={history.length}
      history={<AsHistoryPanel caseId={c.id} items={history} state={c.진행상태} meUid={session.uid} canManage={canManage} />}
      photos={<AsPhotos caseId={c.id} photos={c.사진} meName={session.name} canManage={canManage} />}
    />
  );
}

function Missing() {
  return (
    <div className="m-6 max-w-xl rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
      <p className="font-semibold">A/S를 찾을 수 없습니다</p>
      <p className="mt-1 text-zinc-500">삭제되었거나 볼 권한이 없는 A/S입니다.</p>
      <Link href="/as" className="mt-3 inline-block text-blue-600 hover:underline">
        ← A/S 목록
      </Link>
    </div>
  );
}

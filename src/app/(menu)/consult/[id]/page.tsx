import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { fetchConsult, fetchConsultMembers, fetchConsultRecords } from "@/lib/consult";
import { exclusionFor } from "@/lib/excluded-users";
import { canApprove, canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";

import { ConsultForm } from "../consult-form";
import { ConsultRecords } from "../consult-records";

export const metadata = { title: "상담노트 | 고객상담" };

type Params = Promise<{ id: string }>;

export default function ConsultDetailPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">상담노트를 불러오는 중…</p>}>
        <ConsultDetail params={params} />
      </Suspense>
    </main>
  );
}

async function ConsultDetail({ params }: { params: Params }) {
  await connection();
  const session = await requireUser();
  if (!canUseConsult(session)) redirect("/"); // RD·관리자 이상만 (주소를 직접 입력해도 막음)
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return <Missing />;

  const exclusion = await exclusionFor(session.uid);
  // RD는 담당이 본인인 상담만, 관리자 이상은 전체
  const isRd = session.role.trim() === RESTRICTED_ROLE;
  const view = { ...exclusion, salesName: isRd ? session.name : null };
  const result = await Promise.all([
    fetchConsult(id, view),
    fetchConsultRecords(id, exclusion),
    isRd ? Promise.resolve([]) : fetchConsultMembers(exclusion),
  ]).then(
    ([consult, records, members]) => ({ ok: true as const, consult, records, members }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">상담노트를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }
  const { consult, records, members } = result;
  // 없거나 볼 수 없는 상담이면 기록도 보여주지 않는다
  if (!consult) return <Missing />;

  return (
    <ConsultForm
      consult={consult}
      members={members}
      me={{ name: session.name, sid: session.sid }}
      isRd={isRd}
      today={todayInKorea()}
      recordCount={records.length}
      records={<ConsultRecords consultId={consult.id} records={records} meUid={session.uid} canManage={canApprove(session)} />}
    />
  );
}

function Missing() {
  return (
    <div className="m-6 max-w-xl rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
      <p className="font-semibold">상담노트를 찾을 수 없습니다</p>
      <p className="mt-1 text-zinc-500">삭제되었거나 볼 권한이 없는 상담입니다.</p>
      <Link href="/consult" className="mt-3 inline-block text-blue-600 hover:underline">
        ← 상담 목록
      </Link>
    </div>
  );
}

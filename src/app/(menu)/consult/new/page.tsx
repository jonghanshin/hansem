import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { fetchConsultMembers } from "@/lib/consult";
import { exclusionFor } from "@/lib/excluded-users";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";

import { ConsultForm } from "../consult-form";

export const metadata = { title: "새 상담 | 고객상담" };

export default function NewConsultPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
        <NewConsult />
      </Suspense>
    </main>
  );
}

async function NewConsult() {
  await connection();
  const session = await requireUser();
  if (!canUseConsult(session)) redirect("/"); // RD·관리자 이상만 (주소를 직접 입력해도 막음)
  const isRd = session.role.trim() === RESTRICTED_ROLE;
  const members = isRd ? [] : await fetchConsultMembers(await exclusionFor(session.uid));
  return (
    <ConsultForm
      consult={null}
      members={members}
      me={{ name: session.name, sid: session.sid }}
      isRd={isRd}
      today={todayInKorea()}
    />
  );
}

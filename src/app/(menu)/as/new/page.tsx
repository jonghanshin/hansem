import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { fetchAsMembers } from "@/lib/as";
import { requireUser } from "@/lib/auth";
import { todayInKorea } from "@/lib/calendar-shared";
import { canUseConsult, RESTRICTED_ROLE } from "@/lib/data-scope";
import { exclusionFor } from "@/lib/excluded-users";

import { AsNewForm } from "../as-new-form";

export const metadata = { title: "A/S 접수 | A/S관리" };

export default function NewAsPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0 lg:overflow-auto">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
        <NewAs />
      </Suspense>
    </main>
  );
}

async function NewAs() {
  await connection();
  const session = await requireUser();
  if (!canUseConsult(session)) redirect("/"); // RD·관리자 이상만
  const members = await fetchAsMembers(await exclusionFor(session.uid));
  return (
    <AsNewForm
      members={members}
      isRd={session.role.trim() === RESTRICTED_ROLE}
      me={session.name}
      today={todayInKorea()}
      defaultManager={members.find((m) => m.역할 === "관리자")?.이름 ?? ""}
    />
  );
}

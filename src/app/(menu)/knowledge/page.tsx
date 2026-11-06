import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { fetchKnowledgeRows } from "@/lib/knowledge";
import { isKnowledgeKey, KNOWLEDGE_KEYS, KNOWLEDGE_TABLES, type KnowledgeTableKey } from "@/lib/knowledge-shared";

import { KnowledgeTable } from "./knowledge-table";

export const metadata = { title: "지식자산 | 현장정보 관리" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function KnowledgePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">지식자산을 불러오는 중…</p>}>
        <KnowledgeContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function KnowledgeContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  await requireUser();
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: KnowledgeTableKey = isKnowledgeKey(rawTab) ? rawTab : "vendors";

  const result = await fetchKnowledgeRows(tab).then(
    (rows) => ({ ok: true as const, rows }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-4 pt-3 sm:px-6">
        <h1 className="pb-3 text-lg font-semibold text-zinc-900">지식자산</h1>
        <nav className="flex gap-1 self-end" aria-label="지식자산 종류">
          {KNOWLEDGE_KEYS.map((k) => {
            const active = k === tab;
            return (
              <Link
                key={k}
                href={k === "vendors" ? "/knowledge" : `/knowledge?tab=${k}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium ${
                  active ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {KNOWLEDGE_TABLES[k].label}
              </Link>
            );
          })}
        </nav>
      </header>

      {result.ok ? (
        <KnowledgeTable key={tab} tableKey={tab} rows={result.rows} />
      ) : (
        <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">데이터를 불러오지 못했습니다</p>
          <p className="mt-1 whitespace-pre-line">{result.error}</p>
        </div>
      )}
    </div>
  );
}

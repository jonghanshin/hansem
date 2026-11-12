import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireUser, resolveScope } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/data-scope";
import type { Deposit } from "@/lib/deposits";
import { MONEY_GROUP_NOTE, MONEY_GROUPS, summarizeSiteMoney, type MoneyGroupSummary } from "@/lib/site-money";
import { fetchAllDeposits, fetchSites } from "@/lib/sites-data";
import { formatMoney, type Site } from "@/lib/sites";

import { BALANCE_ROW_COUNT } from "./balance-config";
import { BalanceRows } from "./balance-rows";

export const metadata = { title: "대시보드 | 현장정보 관리" };

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 lg:min-h-0">
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">대시보드를 불러오는 중…</p>}>
        <DashboardLoader />
      </Suspense>
    </main>
  );
}


async function DashboardLoader() {
  await connection(); // 항상 요청 시점의 최신 데이터를 읽는다
  const session = await requireUser();
  if (!isSuperAdmin(session)) redirect("/"); // 슈퍼관리자만 볼 수 있다 (주소를 직접 입력해도 막음)
  // 슈퍼관리자 전용 화면: 전체 데이터 (열외 계정 데이터는 열외가 아닌 사용자에게 빼고)
  const all = { ...(await resolveScope(session)), salesName: null, hidePrivateSites: false };
  const result = await Promise.all([fetchSites(all), fetchAllDeposits(all)]).then(
    ([sites, deposits]) => ({ ok: true as const, sites, deposits }),
    (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  if (!result.ok) {
    return (
      <div className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">대시보드를 불러오지 못했습니다</p>
        <p className="mt-1 whitespace-pre-line">{result.error}</p>
      </div>
    );
  }

  // 진행 중 = 완료일이 없는 현장
  const active = result.sites.filter((s) => !s.완료일);
  const byNumber = new Map<string, Deposit[]>();
  for (const d of result.deposits) {
    const no = d.현장번호?.trim();
    if (!no) continue;
    const list = byNumber.get(no);
    if (list) list.push(d);
    else byNumber.set(no, [d]);
  }
  const rows = active.map((site) => ({
    site,
    groups: summarizeSiteMoney(site, byNumber.get(site.현장번호?.trim() ?? "") ?? []),
  }));
  const total: MoneyGroupSummary[] = MONEY_GROUPS.map((g, i) => ({
    label: g.label,
    planned: rows.reduce((acc, r) => acc + (r.groups[i].planned ?? 0), 0),
    paidIn: rows.reduce((acc, r) => acc + r.groups[i].paidIn, 0),
    paidOut: rows.reduce((acc, r) => acc + r.groups[i].paidOut, 0),
  }));

  // 마지막 줄(미입금 + 통장잔고 − (예상공사비 − 출금))용 합계: 해당 항목의 계약금이 없는 현장은 빼고 더한다
  const contracted = (g: MoneyGroupSummary) => (g.planned ?? 0) > 0;
  const balanceBase = MONEY_GROUPS.map((_, i) => {
    const groups = rows.map((r) => r.groups[i]).filter(contracted);
    return {
      unpaid: groups.reduce((acc, g) => acc + (g.planned ?? 0) - g.paidIn, 0),
      paidOut: groups.reduce((acc, g) => acc + g.paidOut, 0),
    };
  });

  return <DashboardTable rows={rows} total={total} balanceBase={balanceBase} />;
}

type Measure = { key: string; label: string; className: string; value: (g: MoneyGroupSummary) => number | null };

const MEASURES: Measure[] = [
  { key: "planned", label: "계약금", className: "text-zinc-900", value: (g) => g.planned },
  { key: "paidIn", label: "입금", className: "text-emerald-700", value: (g) => g.paidIn },
  { key: "paidOut", label: "출금", className: "text-red-600", value: (g) => g.paidOut },
  // 미입금 = 계약금 − 입금 (계약금이 비어 있으면 0으로 계산)
  { key: "unpaid", label: "미입금", className: "text-amber-700", value: (g) => (g.planned ?? 0) - g.paidIn },
];

function DashboardTable({
  rows,
  total,
  balanceBase,
}: {
  rows: { site: Site; groups: MoneyGroupSummary[] }[];
  total: MoneyGroupSummary[];
  /** 항목별 계약금이 있는 현장만 더한 미입금·출금 (마지막 줄 계산용) */
  balanceBase: { unpaid: number; paidOut: number }[];
}) {
  // 합산 아래 예상공사비·통장잔고·계산 줄 (화면에서 입력)
  const balanceColumns = total.map((g, i) => ({
    label: g.label,
    planned: g.planned ?? 0,
    unpaid: balanceBase[i].unpaid,
    paidOut: balanceBase[i].paidOut,
  }));
  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold text-zinc-900">
          대시보드 <span className="ml-1 text-sm font-normal text-zinc-500">진행 중인 현장 {rows.length}건</span>
        </h1>
        <p className="text-xs text-zinc-500">완료일이 없는 현장 기준 · {MONEY_GROUP_NOTE}</p>
      </header>

      <div className="flex-1 overflow-auto bg-white lg:min-h-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-600 shadow-[inset_0_-1px_0] shadow-zinc-200">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">현장</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">구분</th>
              {MONEY_GROUPS.map((g) => (
                <th key={g.label} scope="col" className="px-3 py-2.5 text-right font-medium">
                  {g.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-zinc-500">
                  진행 중인 현장이 없습니다.
                </td>
              </tr>
            )}
            {rows.map(({ site, groups }) => (
              <MatrixRows
                key={site.id}
                head={
                  <>
                    <span className="block font-medium text-zinc-900">{site.고객명 || "(고객명 없음)"}</span>
                    <span className="block text-xs text-zinc-500 tabular-nums">
                      {[site.현장번호, site.영업사원].filter(Boolean).join(" · ")}
                    </span>
                  </>
                }
                groups={groups}
              />
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-zinc-100 font-semibold shadow-[inset_0_2px_0] shadow-zinc-300">
            <MatrixRows head={<span className="text-zinc-900">합산</span>} groups={total} extraRows={BALANCE_ROW_COUNT} />
            <BalanceRows columns={balanceColumns} />
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** 한 현장의 계약금·입금·출금·미입금 4행 (합산은 예상공사비까지 5행) */
function MatrixRows({
  head,
  groups,
  measures = MEASURES,
  extraRows = 0,
}: {
  head: React.ReactNode;
  groups: MoneyGroupSummary[];
  measures?: Measure[];
  /** 아래에 이어 붙는 행 수 (현장 칸 rowSpan에 포함) */
  extraRows?: number;
}) {
  return measures.map((m, i) => {
    const values = groups.map(m.value);
    const sum = values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    return (
      <tr key={m.key} className={i === 0 ? "border-t border-zinc-200" : undefined}>
        {i === 0 && (
          <th scope="rowgroup" rowSpan={measures.length + extraRows} className="px-3 py-1.5 text-left align-top font-normal">
            {head}
          </th>
        )}
        <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">{m.label}</td>
        {values.map((v, j) => (
          <td key={j} className={`px-3 py-1.5 text-right tabular-nums ${m.className}`}>
            <Amount value={v} />
          </td>
        ))}
        <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${m.className}`}><Amount value={sum} /></td>
      </tr>
    );
  });
}

/** 금액 칸: 비어 있으면 -, 0은 흐리게, 음수(미입금에서 입금이 더 많은 경우)는 "초과" */
function Amount({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-300">-</span>;
  if (value === 0) return <span className="text-zinc-400">0</span>;
  if (value < 0) return <span className="text-red-600">초과 {formatMoney(-value)}</span>;
  return formatMoney(value);
}

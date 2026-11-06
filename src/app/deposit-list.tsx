"use client";

import type { Deposit } from "@/lib/deposits";
import { MONEY_GROUP_NOTE, summarizeSiteMoney, type ContractAmounts } from "@/lib/site-money";
import { formatMoney } from "@/lib/sites";

export function DepositList({
  siteNumber,
  contract,
  deposits,
  loading,
  error,
  onRetry,
}: {
  siteNumber: string;
  /** 현장정보의 계약 금액 (계약가·시공비·한샘·홈씨씨) */
  contract?: ContractAmounts | null;
  deposits: Deposit[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="px-5 py-5">
        <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!deposits) {
    return <p className="px-5 py-5 text-sm text-zinc-500">{loading ? "입금내역을 불러오는 중…" : ""}</p>;
  }

  const inTotal = sum(deposits.filter((d) => d.입출금 === "입금"));
  const outTotal = sum(deposits.filter((d) => d.입출금 === "출금"));

  return (
    <div className={loading ? "opacity-60" : undefined}>
      {contract && <ContractVsPaid contract={contract} deposits={deposits} />}
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200">
        <Stat label="입금 합계" value={inTotal} className="text-emerald-700" />
        <Stat label="출금 합계" value={outTotal} className="text-red-600" />
      </div>

      <p className="px-5 pt-4 pb-2 text-xs text-zinc-500">
        현장번호 <span className="font-medium text-zinc-700">{siteNumber}</span> · {deposits.length}건 · 날짜순
      </p>

      {deposits.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-500">이 현장의 입금내역이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
          {deposits.map((d, i) => {
            const isIn = d.입출금 === "입금";
            const isOut = d.입출금 === "출금";
            return (
              // 입금내역 테이블에는 고유 id가 없어 순번을 key로 사용
              <li key={i} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                        isIn ? "bg-emerald-50 text-emerald-700" : isOut ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {d.입출금 ?? "—"}
                    </span>
                    <span className="truncate text-sm font-medium text-zinc-900">{d.입금내용 ?? "(내용 없음)"}</span>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      isIn ? "text-emerald-700" : isOut ? "text-red-600" : "text-zinc-900"
                    }`}
                  >
                    {isOut ? "−" : isIn ? "+" : ""}
                    {d.amount !== null ? formatMoney(d.amount) : (d.입금액 ?? "")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {[d.dateIso ?? d.날짜, d.입금자, d.입금처 && `→ ${d.입금처}`, d.입금구분].filter(Boolean).join(" · ")}
                </p>
                {(d.현금영수증 || d.비고) && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {d.현금영수증 && <span>현금영수증: {d.현금영수증}</span>}
                    {d.현금영수증 && d.비고 && " · "}
                    {d.비고 && <span>비고: {d.비고}</span>}
                  </p>
                )}
                {d["A/S"] && <p className="mt-0.5 text-xs whitespace-pre-line text-zinc-500">A/S: {d["A/S"]}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 최초 계약 금액과 실제 입금·출금 (시공비·한샘·홈씨씨별) */
function ContractVsPaid({ contract, deposits }: { contract: ContractAmounts; deposits: Deposit[] }) {
  const rows = summarizeSiteMoney(contract, deposits);
  const total = {
    paidIn: rows.reduce((acc, r) => acc + r.paidIn, 0),
    paidOut: rows.reduce((acc, r) => acc + r.paidOut, 0),
  };
  return (
    <section className="border-b border-zinc-200 px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">계약 금액 대비 입금·출금</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">항목</th>
              <th scope="col" className="py-1 text-right font-medium">계약</th>
              <th scope="col" className="py-1 text-right font-medium">입금</th>
              <th scope="col" className="py-1 text-right font-medium">미입금</th>
              <th scope="col" className="py-1 text-right font-medium">출금</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums">
            {rows.map((r) => (
              <AmountRow key={r.label} {...r} />
            ))}
            <AmountRow label="계약가 (합계)" planned={contract.계약가} {...total} strong />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">{MONEY_GROUP_NOTE}</p>
    </section>
  );
}

function AmountRow({
  label,
  planned,
  paidIn,
  paidOut,
  strong,
}: {
  label: string;
  planned: number | null;
  paidIn: number;
  paidOut: number;
  strong?: boolean;
}) {
  const remain = planned === null ? null : planned - paidIn;
  const dash = <span className="text-zinc-300">-</span>;
  return (
    <tr className={strong ? "border-t-2 border-zinc-200 font-semibold" : undefined}>
      <td className={`py-1.5 whitespace-nowrap ${strong ? "text-zinc-900" : "text-zinc-700"}`}>{label}</td>
      <td className="py-1.5 text-right text-zinc-900">{planned === null ? dash : formatMoney(planned)}</td>
      <td className="py-1.5 text-right text-emerald-700">{formatMoney(paidIn)}</td>
      <td
        className={`py-1.5 text-right ${
          remain === null ? "" : remain === 0 ? "text-zinc-400" : remain > 0 ? "text-amber-700" : "text-red-600"
        }`}
      >
        {remain === null ? dash : remain < 0 ? `초과 ${formatMoney(-remain)}` : formatMoney(remain)}
      </td>
      <td className="py-1.5 text-right text-red-600">{paidOut ? formatMoney(paidOut) : <span className="text-zinc-400">0</span>}</td>
    </tr>
  );
}

function sum(rows: Deposit[]) {
  return rows.reduce((acc, d) => acc + (d.amount ?? 0), 0);
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="bg-white px-3 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${className}`}>{formatMoney(value)}</p>
    </div>
  );
}

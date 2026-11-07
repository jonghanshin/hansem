"use client";

import { useState } from "react";

import { formatMoney, toMoney } from "@/lib/sites";

import { DEFAULT_EXPECTED_RATE } from "./balance-config";

export type BalanceColumn = {
  label: string;
  /** 합산 계약금 */
  planned: number;
  /** 미입금 합계 (이 항목의 계약금이 있는 현장만) */
  unpaid: number;
  /** 출금 합계 (이 항목의 계약금이 있는 현장만) */
  paidOut: number;
};

const INPUT =
  "rounded-md border bg-white px-2 py-1 text-right text-sm font-semibold tabular-nums text-zinc-900 outline-none placeholder:font-normal placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** "85", "85%", "85.5" → 85.5. 빈 칸은 기본 비율, 해석할 수 없으면 null */
function parseRate(s: string): number | null {
  const t = s.replace(/[%\s]/g, "");
  if (!t) return DEFAULT_EXPECTED_RATE;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 200 ? n : null;
}

/**
 * 대시보드 합산의 마지막 세 줄 (tfoot 안). 모두 화면에서 입력하는 값이며 저장하지 않는다(새로고침하면 초기화).
 * - 예상공사비: 항목별 비율(기본 85%) × 합산 계약금
 * - 통장잔고: 항목별 직접 입력
 * - 미입금 + 통장잔고 − (예상공사비 − 출금). 미입금·출금은 해당 항목의 계약금이 있는 현장만 더한 값
 */
export function BalanceRows({ columns }: { columns: BalanceColumn[] }) {
  const [rates, setRates] = useState<Record<string, string>>({});
  const [balances, setBalances] = useState<Record<string, string>>({});

  const rate = columns.map((c) => parseRate(rates[c.label] ?? ""));
  const expected = columns.map((c, i) => (rate[i] === null ? null : Math.round((c.planned * rate[i]!) / 100)));
  const balance = columns.map((c) => {
    const n = toMoney(balances[c.label] ?? "");
    return n === undefined ? null : (n ?? 0); // 숫자가 아니면 계산하지 않음(null), 빈 칸은 0
  });
  const net = columns.map((c, i) =>
    // 예상공사비 중 이미 출금한 금액은 빼고, 앞으로 나갈 공사비만 차감한다
    expected[i] === null || balance[i] === null ? null : c.unpaid + balance[i]! - (expected[i]! - c.paidOut),
  );
  const sum = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, x) => a + x!, 0));

  return (
    <>
      <tr className="border-t border-zinc-300">
        <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">
          예상공사비
          <span className="block text-xs font-normal text-zinc-400">계약금 × 비율</span>
        </td>
        {columns.map((c, i) => (
          <td key={c.label} className="px-3 py-1.5 text-right">
            <span className="inline-flex items-center gap-1">
              <input
                value={rates[c.label] ?? String(DEFAULT_EXPECTED_RATE)}
                onChange={(e) => setRates((v) => ({ ...v, [c.label]: e.target.value }))}
                inputMode="decimal"
                aria-label={`${c.label} 예상공사비 비율(%)`}
                aria-invalid={rate[i] === null}
                className={`${INPUT} w-14 ${rate[i] === null ? "border-red-400" : "border-zinc-300"}`}
              />
              <span className="text-xs font-normal text-zinc-500">%</span>
            </span>
            <span className="mt-0.5 block text-blue-700 tabular-nums">
              <Money value={expected[i]} />
            </span>
          </td>
        ))}
        <td className="px-3 py-1.5 text-right align-bottom text-blue-700 tabular-nums">
          <Money value={sum(expected)} />
        </td>
      </tr>
      <tr>
        <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600">통장잔고</td>
        {columns.map((c, i) => (
          <td key={c.label} className="px-3 py-1.5 text-right">
            <input
              value={balances[c.label] ?? ""}
              onChange={(e) => setBalances((v) => ({ ...v, [c.label]: e.target.value }))}
              onBlur={() => {
                const n = toMoney(balances[c.label] ?? "");
                if (typeof n === "number") setBalances((v) => ({ ...v, [c.label]: formatMoney(n) }));
              }}
              inputMode="numeric"
              placeholder="직접 입력"
              aria-label={`${c.label} 통장잔고`}
              aria-invalid={balance[i] === null}
              className={`${INPUT} w-36 ${balance[i] === null ? "border-red-400" : "border-zinc-300"}`}
            />
          </td>
        ))}
        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-900">
          <Money value={sum(balance)} />
        </td>
      </tr>
      <tr>
        <td className="px-3 py-1.5 text-zinc-600">
          미입금 + 통장잔고
          <br />− (예상공사비 − 출금)
          <span className="block text-xs font-normal text-zinc-400">계약금 없는 현장 제외</span>
        </td>
        {net.map((v, i) => (
          <td key={columns[i].label} className="px-3 py-1.5 text-right tabular-nums">
            <Money value={v} signed />
          </td>
        ))}
        <td className="px-3 py-1.5 text-right tabular-nums">
          <Money value={sum(net)} signed />
        </td>
      </tr>
    </>
  );
}

function Money({ value, signed }: { value: number | null; signed?: boolean }) {
  if (value === null) return <span className="text-zinc-300">-</span>;
  if (!signed) return formatMoney(value);
  return (
    <span className={value < 0 ? "text-red-600" : value > 0 ? "text-emerald-700" : "text-zinc-400"}>
      {value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}
    </span>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { listSettlementInfoAction, type SettlementInfoRow } from "@/app/settlement-actions";
import { formatMoney, toMoney } from "@/lib/sites";

const SELECT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:w-40";
const TH = "whitespace-nowrap border-b border-zinc-200 px-3 py-2 font-medium";
const TD = "whitespace-nowrap border-b border-zinc-100 px-3 py-2";
const NUM = "text-right tabular-nums";

/** "11월" → 11 (정렬용, 숫자가 없으면 맨 뒤) */
function monthOrder(v: string) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

const distinct = (values: (string | null)[]) => [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))];
const amount = (v: string | null) => toMoney(v) ?? 0;

/** 저장된 정산결과(정산정보)를 영업사원·월로 골라 보는 창 */
export function SettlementInfoDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<SettlementInfoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState("");
  const [month, setMonth] = useState("");

  useEffect(() => {
    let active = true;
    void listSettlementInfoAction().then((res) => {
      if (!active) return;
      if (res.ok) setRows(res.data);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, []);

  const salesOptions = useMemo(() => distinct((rows ?? []).map((r) => r.영업사원)).sort((a, b) => a.localeCompare(b, "ko")), [rows]);
  const monthOptions = useMemo(
    () => distinct((rows ?? []).map((r) => r.정산월)).sort((a, b) => monthOrder(a) - monthOrder(b) || a.localeCompare(b, "ko")),
    [rows],
  );
  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => (!sales || r.영업사원?.trim() === sales) && (!month || r.정산월?.trim() === month))
        .sort(
          (a, b) =>
            monthOrder(a.정산월 ?? "") - monthOrder(b.정산월 ?? "") || (a.영업사원 ?? "").localeCompare(b.영업사원 ?? "", "ko"),
        ),
    [rows, sales, month],
  );
  const total = (key: "총이익금" | "정산금" | "이월금") => shown.reduce((acc, r) => acc + amount(r[key]), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-info-title"
        className="flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="settlement-info-title" className="text-base font-semibold text-zinc-900">
              정산결과
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">정산 화면에서 저장한 정산정보입니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            닫기
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
          <label className="w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium text-zinc-700">영업사원</span>
            <select value={sales} onChange={(e) => setSales(e.target.value)} className={SELECT}>
              <option value="">전체</option>
              {salesOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium text-zinc-700">정산월</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={SELECT}>
              <option value="">전체</option>
              {monthOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {error ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : rows === null ? (
            <p className="text-sm text-zinc-500">불러오는 중…</p>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {rows.length === 0 ? "저장된 정산결과가 없습니다." : "조건에 맞는 정산결과가 없습니다."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-100 text-xs text-zinc-600">
                  <tr>
                    <th className={`${TH} text-left`}>정산월</th>
                    <th className={`${TH} text-left`}>영업사원</th>
                    <th className={`${TH} text-right`}>총이익금</th>
                    <th className={`${TH} text-right`}>정산금</th>
                    <th className={`${TH} text-right`}>이월금</th>
                    <th className={`${TH} text-right`}>누적이월금</th>
                    <th className={`${TH} text-left`}>저장일시</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="text-zinc-800">
                      <td className={TD}>{r.정산월}</td>
                      <td className={TD}>
                        {r.영업사원}
                        {r.영업사원ID && <span className="ml-1 text-xs text-zinc-400">{r.영업사원ID}</span>}
                      </td>
                      <td className={`${TD} ${NUM}`}>{formatMoney(amount(r.총이익금))}</td>
                      <td className={`${TD} ${NUM} font-semibold text-blue-700`}>{formatMoney(amount(r.정산금))}</td>
                      <td className={`${TD} ${NUM} text-amber-700`}>{formatMoney(amount(r.이월금))}</td>
                      <td className={`${TD} ${NUM}`}>{formatMoney(amount(r.누적이월금))}</td>
                      <td className={`${TD} tabular-nums text-zinc-500`}>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
                {shown.length > 1 && (
                  <tfoot className="bg-zinc-100 font-semibold">
                    <tr>
                      <td colSpan={2} className="px-3 py-2">
                        합계 ({shown.length}건)
                      </td>
                      <td className={`px-3 py-2 ${NUM}`}>{formatMoney(total("총이익금"))}</td>
                      <td className={`px-3 py-2 ${NUM} text-blue-700`}>{formatMoney(total("정산금"))}</td>
                      <td className={`px-3 py-2 ${NUM} text-amber-700`}>{formatMoney(total("이월금"))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

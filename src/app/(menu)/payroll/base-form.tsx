"use client";

import { useState, useTransition } from "react";

import { savePayrollBaseAction } from "@/app/payroll-actions";
import { ALLOWANCE_POSITIONS, AMOUNT_FIELDS, RATE_FIELDS, type AllowancePosition, type PayrollBase } from "@/lib/payroll-shared";

import { AmountInput, INPUT, parseAmount } from "./amount-input";

type RateKey = (typeof RATE_FIELDS)[number]["key"];
type AmountKey = (typeof AMOUNT_FIELDS)[number]["key"];

/** 연도별 급여 기준정보 수정 (요율은 %, 금액은 원) */
export function BaseForm({ year, initial, savedInfo }: { year: number; initial: PayrollBase; savedInfo: string | null }) {
  const [rates, setRates] = useState<Record<RateKey, string>>(
    () => Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<RateKey, string>,
  );
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(
    () => Object.fromEntries(AMOUNT_FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<AmountKey, string>,
  );
  const [allowance, setAllowance] = useState<Record<AllowancePosition, string>>(
    () => Object.fromEntries(ALLOWANCE_POSITIONS.map((p) => [p, String(initial.직책수당[p])])) as Record<AllowancePosition, string>,
  );
  const [payDay, setPayDay] = useState(String(initial.지급일));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const base = {
      ...Object.fromEntries(RATE_FIELDS.map((f) => [f.key, rates[f.key].trim() === "" ? NaN : Number(rates[f.key])])),
      ...Object.fromEntries(AMOUNT_FIELDS.map((f) => [f.key, parseAmount(amounts[f.key])])),
      지급일: Number(payDay),
      직책수당: Object.fromEntries(ALLOWANCE_POSITIONS.map((p) => [p, parseAmount(allowance[p])])),
    };
    setMessage(null);
    startTransition(async () => {
      const r = await savePayrollBaseAction(year, base);
      setMessage(r.ok ? { ok: true, text: `${year}년 기준정보를 저장했습니다` } : { ok: false, text: r.error });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <section className={CARD}>
        <h2 className={CARD_TITLE}>4대보험·세금 요율</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {RATE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className={LABEL}>
                {f.label}
                <span className="font-normal text-zinc-400">{f.hint}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <input
                  inputMode="decimal"
                  value={rates[f.key]}
                  onChange={(e) => setRates((s) => ({ ...s, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))}
                  className={`${INPUT} text-right tabular-nums`}
                  required
                />
                <span className="text-sm text-zinc-500">%</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>지급 기준 금액</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {AMOUNT_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className={LABEL}>
                {f.label}
                <span className="font-normal text-zinc-400">{f.hint}</span>
              </span>
              <AmountInput value={amounts[f.key]} onChange={(v) => setAmounts((s) => ({ ...s, [f.key]: v }))} />
            </label>
          ))}
          <label className="block">
            <span className={LABEL}>
              지급일
              <span className="font-normal text-zinc-400">매월, 그 달에 없는 날이면 말일</span>
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={31}
                value={payDay}
                onChange={(e) => setPayDay(e.target.value)}
                className={`${INPUT} text-right tabular-nums`}
                required
              />
              <span className="text-sm text-zinc-500">일</span>
            </span>
          </label>
        </div>
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>
          직급별 직책수당 <span className="font-normal text-zinc-400">비과세 · 실장은 직책수당·차량유지비·식대 없음</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ALLOWANCE_POSITIONS.map((p) => (
            <label key={p} className="block">
              <span className={LABEL}>{p}</span>
              <AmountInput value={allowance[p]} onChange={(v) => setAllowance((s) => ({ ...s, [p]: v }))} />
            </label>
          ))}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-zinc-500">
        · 기본급 외 지급항목(직책수당·차량유지비·식대·성과급·최소실적지원금)은 비과세로, 4대보험·소득세는 기본급에 대해서만 계산합니다.
        <br />· 요율을 바꿔도 이미 저장한 명세서는 바뀌지 않습니다. 명세서를 다시 저장하면 새 요율로 계산됩니다.
      </p>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {savedInfo && !message && <span className="text-xs text-zinc-400">최근 저장: {savedInfo}</span>}
        {message && (
          <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
            {message.text}
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "저장 중…" : `${year}년 기준정보 저장`}
        </button>
      </div>
    </form>
  );
}

const CARD = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5";
const CARD_TITLE = "mb-3 text-sm font-semibold text-zinc-900";
const LABEL = "mb-1 flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-zinc-700";

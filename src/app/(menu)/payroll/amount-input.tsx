"use client";

export const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** "1,234" → 1234, 빈칸 → 0, 숫자가 아니면 NaN (서버에서 거절) */
export function parseAmount(v: string): number {
  const s = v.replace(/,/g, "").trim();
  if (s === "") return 0;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

function withCommas(v: string): string {
  const digits = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits === "" ? "" : Number(digits).toLocaleString("ko-KR");
}

/** 원 단위 금액 입력 (천 단위 쉼표) */
export function AmountInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        inputMode="numeric"
        value={withCommas(value)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        aria-label={label}
        className={`${INPUT} text-right tabular-nums`}
      />
      <span className="text-sm text-zinc-500">원</span>
    </span>
  );
}

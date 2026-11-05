"use client";

import { useId, useState, useTransition } from "react";

import { createDepositAction } from "@/app/actions";
import { DEPOSIT_KINDS, DEPOSIT_TYPES, type Deposit, type DepositInput } from "@/lib/deposits";
import { formatMoney, type SiteSummary } from "@/lib/sites";

// 입금/출금 전환 시 입금구분 기본값 (기존 데이터: 입금은 모두 "한샘", 출금은 모두 "시공비")
const DEFAULT_TYPE: Record<(typeof DEPOSIT_KINDS)[number], string> = { 입금: "한샘", 출금: "시공비" };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type DepositSuggestions = {
  입금자: string[];
  입금처: string[];
  현금영수증: string[];
};

export function DepositFormDialog({
  sites,
  suggestions,
  onClose,
  onCreated,
}: {
  sites: SiteSummary[];
  suggestions: DepositSuggestions;
  onClose: () => void;
  onCreated: (deposit: Deposit) => void;
}) {
  const idp = useId();
  const [values, setValues] = useState<DepositInput>(() => ({
    현장번호: "",
    고객명: "",
    영업사원: "",
    계약가: "",
    입출금: "입금",
    입금액: "",
    날짜: todayIso(),
    입금자: "",
    입금내용: "",
    입금처: "",
    입금구분: DEFAULT_TYPE.입금,
    현금영수증: "",
    비고: "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof DepositInput, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const matchedSite = sites.find((s) => s.현장번호 === values.현장번호.trim()) ?? null;

  function onSiteNumberChange(value: string) {
    const site = sites.find((s) => s.현장번호 === value.trim());
    setValues((v) => ({
      ...v,
      현장번호: value,
      // 현장정보에 있는 번호면 고객명/영업사원/계약가를 채운다 (이후 직접 수정 가능)
      ...(site && {
        고객명: site.고객명 ?? "",
        영업사원: site.영업사원 ?? "",
        계약가: formatMoney(site.계약가),
      }),
    }));
  }

  function onKindChange(kind: (typeof DEPOSIT_KINDS)[number]) {
    setValues((v) => {
      const other = kind === "입금" ? DEFAULT_TYPE.출금 : DEFAULT_TYPE.입금;
      // 입금구분이 비었거나 다른 쪽 기본값이면 새 기본값으로 바꾼다 (직접 입력한 값은 유지)
      const 입금구분 = !v.입금구분 || v.입금구분 === other ? DEFAULT_TYPE[kind] : v.입금구분;
      return { ...v, 입출금: kind, 입금구분 };
    });
  }

  function formatAmountOnBlur(key: "입금액" | "계약가") {
    const n = Number(values[key].replace(/[,\s원]/g, ""));
    if (values[key].trim() && Number.isFinite(n)) set(key, formatMoney(Math.round(n)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createDepositAction(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated(res.data);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idp}-title`}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 id={`${idp}-title`} className="text-lg font-semibold text-zinc-900">
            입금 등록
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="닫기"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">현장</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="col-span-2">
                <Label required>현장번호</Label>
                <input
                  list={`${idp}-sites`}
                  value={values.현장번호}
                  onChange={(e) => onSiteNumberChange(e.target.value)}
                  placeholder="번호 입력 또는 목록에서 선택"
                  required
                  autoFocus
                  className={INPUT}
                />
                <datalist id={`${idp}-sites`}>
                  {sites.map((s) => (
                    <option key={s.현장번호} value={s.현장번호 ?? ""}>
                      {[s.고객명, s.영업사원].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </datalist>
                <span className={`mt-1 block text-xs ${matchedSite ? "text-emerald-700" : "text-zinc-400"}`}>
                  {matchedSite
                    ? "현장정보에서 고객명·영업사원·계약가를 채웠습니다"
                    : values.현장번호.trim()
                      ? "현장정보에 없는 번호입니다 (그대로 등록 가능)"
                      : " "}
                </span>
              </label>
              <label className="col-span-2">
                <Label>고객명</Label>
                <input value={values.고객명} onChange={(e) => set("고객명", e.target.value)} className={INPUT} />
              </label>
              <label className="col-span-2">
                <Label>영업사원</Label>
                <input value={values.영업사원} onChange={(e) => set("영업사원", e.target.value)} className={INPUT} />
              </label>
              <label className="col-span-2">
                <Label>계약가</Label>
                <input
                  value={values.계약가}
                  onChange={(e) => set("계약가", e.target.value)}
                  onBlur={() => formatAmountOnBlur("계약가")}
                  inputMode="numeric"
                  className={`${INPUT} text-right tabular-nums`}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">입금 정보</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2">
                <Label required>입출금</Label>
                <div className="flex rounded-md border border-zinc-300 p-0.5" role="radiogroup" aria-label="입출금">
                  {DEPOSIT_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={values.입출금 === k}
                      onClick={() => onKindChange(k)}
                      className={`flex-1 rounded px-3 py-1 text-sm font-medium ${
                        values.입출금 === k
                          ? k === "입금"
                            ? "bg-emerald-600 text-white"
                            : "bg-red-600 text-white"
                          : "text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <label className="col-span-2">
                <Label required>금액</Label>
                <input
                  value={values.입금액}
                  onChange={(e) => set("입금액", e.target.value)}
                  onBlur={() => formatAmountOnBlur("입금액")}
                  inputMode="numeric"
                  placeholder="0"
                  required
                  className={`${INPUT} text-right tabular-nums`}
                />
              </label>
              <label className="col-span-2">
                <Label required>날짜</Label>
                <input
                  type="date"
                  value={values.날짜}
                  onChange={(e) => set("날짜", e.target.value)}
                  required
                  className={INPUT}
                />
              </label>
              <label className="col-span-2">
                <Label required>입금구분</Label>
                <select
                  value={values.입금구분}
                  onChange={(e) => set("입금구분", e.target.value)}
                  required
                  className={INPUT}
                >
                  {DEPOSIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <SuggestInput
                label="입금자"
                listId={`${idp}-payer`}
                options={suggestions.입금자}
                value={values.입금자}
                onChange={(v) => set("입금자", v)}
              />
              <SuggestInput
                label="입금처"
                listId={`${idp}-dest`}
                options={suggestions.입금처}
                value={values.입금처}
                onChange={(v) => set("입금처", v)}
              />
              <label className="col-span-2 sm:col-span-4">
                <Label>입금내용</Label>
                <input value={values.입금내용} onChange={(e) => set("입금내용", e.target.value)} className={INPUT} />
              </label>
              <SuggestInput
                label="현금영수증"
                listId={`${idp}-receipt`}
                options={suggestions.현금영수증}
                value={values.현금영수증}
                onChange={(v) => set("현금영수증", v)}
              />
              <label className="col-span-2">
                <Label>비고</Label>
                <input value={values.비고} onChange={(e) => set("비고", e.target.value)} className={INPUT} />
              </label>
            </div>
          </fieldset>
        </div>

        <div className="border-t border-zinc-200 px-5 py-3">
          {error && (
            <p role="alert" className="mb-3 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {pending ? "등록 중…" : "등록"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 block text-xs font-medium text-zinc-700">
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </span>
  );
}

/** 기존 데이터의 값을 자동완성 후보로 보여주는 입력칸 (새 값 직접 입력도 가능) */
function SuggestInput({
  label,
  listId,
  options,
  value,
  onChange,
}: {
  label: string;
  listId: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="col-span-2">
      <Label>{label}</Label>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

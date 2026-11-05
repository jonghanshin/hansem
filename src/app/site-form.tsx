"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createSiteAction, listDepositsAction, syncSiteTotalsAction, updateSiteAction } from "@/app/actions";
import { DepositList } from "@/app/deposit-list";
import type { Deposit } from "@/lib/deposits";
import {
  COMPUTED_FIELDS,
  formatMoney,
  isComputedField,
  SITE_FIELDS,
  type ComputedFieldKey,
  type Site,
  type SiteFieldKey,
} from "@/lib/sites";

import { ComputedSourcesDialog } from "./computed-sources-dialog";

type FormValues = Record<SiteFieldKey, string>;

const SECTIONS: { title: string; keys: SiteFieldKey[] }[] = [
  { title: "기본 정보", keys: ["현장번호", "고객명", "고객전화번호", "현장주소"] },
  { title: "영업", keys: ["영업사원", "영업사원ID", "계약경로"] },
  { title: "금액", keys: ["계약가", "상품가액", "시공비"] },
  { title: "공사", keys: ["공사품목", "공사시기", "계약일", "완료일"] },
  {
    title: "한샘 정산",
    keys: [
      "한샘공급가합계",
      "한샘물대",
      "한샘시공비",
      "한샘추가시공비",
      "한샘시공비외",
      "환불금액",
      "정산여부",
      "정산월",
    ],
  },
];

const REQUIRED: ReadonlySet<SiteFieldKey> = new Set(["현장번호"]);

const FIELD_TYPE = Object.fromEntries(SITE_FIELDS.map((f) => [f.key, f.type])) as Record<
  SiteFieldKey,
  (typeof SITE_FIELDS)[number]["type"]
>;

function toFormValues(site: Site | null): FormValues {
  const values = {} as FormValues;
  for (const f of SITE_FIELDS) {
    const v = site?.[f.key];
    values[f.key] = v === null || v === undefined ? "" : f.type === "money" ? formatMoney(v as number) : String(v);
  }
  return values;
}

// 자동 계산 필드는 사용자가 수정하지 않으므로 변경 여부 비교에서 제외
function sameValues(a: FormValues, b: FormValues) {
  return SITE_FIELDS.every((f) => isComputedField(f.key) || a[f.key].trim() === b[f.key].trim());
}

export function SiteForm({
  site,
  onSaved,
  onSynced,
  onClose,
  onDirtyChange,
  fixedSalesName = null,
}: {
  site: Site | null; // null이면 신규 입력
  /** 값이 있으면(RD 로그인) 영업사원을 이 이름으로 고정하고 수정할 수 없게 한다 */
  fixedSalesName?: string | null;
  onSaved: (site: Site, created: boolean) => void;
  onSynced: (site: Site) => void; // 자동 계산 값이 갱신됨
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = useMemo(() => {
    const v = toFormValues(site);
    if (fixedSalesName) v.영업사원 = fixedSalesName;
    return v;
  }, [site, fixedSalesName]);
  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = !sameValues(values, initial);
  const isNew = site === null;

  // 자동 계산 필드를 더블클릭하면 근거 내역을 보여준다
  const [sourceField, setSourceField] = useState<ComputedFieldKey | null>(null);
  const closeSources = useCallback(() => setSourceField(null), []);

  // 상세 화면을 열 때 자동 계산 필드(한샘공급가합계, 환불금액 등)를 다시 계산해 테이블에 반영
  const [syncing, setSyncing] = useState(!isNew);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const siteId = site?.id ?? null;
  const savedSiteNumber = site?.현장번호 ?? null; // 현장번호를 바꿔 저장하면 다시 계산
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  });
  useEffect(() => {
    if (siteId === null) return;
    let cancelled = false;
    syncSiteTotalsAction(siteId).then((res) => {
      if (cancelled) return;
      setSyncing(false);
      if (!res.ok) {
        setSyncNote(`자동 계산 실패: ${res.error}`);
        return;
      }
      setSyncNote(res.data.warnings.length ? res.data.warnings.join("\n") : null);
      onSyncedRef.current(res.data.site);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, savedSiteNumber]);

  // 입금내역 보기 (폼은 숨기기만 해서 수정 중인 값이 유지된다)
  const [view, setView] = useState<"form" | "deposits">("form");
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositsLoading, startDepositsTransition] = useTransition();
  // 저장된 현장번호 기준으로 조회 (입력 중인 미저장 값이 아니라)
  const siteNumber = site?.현장번호 ?? null;

  function loadDeposits() {
    if (!siteNumber) return;
    setDepositError(null);
    startDepositsTransition(async () => {
      const res = await listDepositsAction(siteNumber);
      if (res.ok) setDeposits(res.data);
      else setDepositError(res.error);
    });
  }

  function toggleDeposits() {
    if (view === "deposits") {
      setView("form");
      return;
    }
    setView("deposits");
    loadDeposits(); // 열 때마다 최신 내역을 다시 읽는다
  }

  function setField(key: SiteFieldKey, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    onDirtyChange(!sameValues(next, initial));
  }

  function reset() {
    setValues(initial);
    setError(null);
    onDirtyChange(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = isNew ? await createSiteAction(values) : await updateSiteAction(site.id, values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setValues(toFormValues(res.data));
      onDirtyChange(false);
      onSaved(res.data, isNew);
    });
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-500">{isNew ? "신규 입력" : "현장 상세"}</p>
          <h2 className="truncate text-lg font-semibold text-zinc-900">
            {isNew ? "새 현장" : site.고객명 || site.현장번호 || `#${site.id}`}
          </h2>
          {!isNew && (
            <p className="mt-0.5 text-xs text-zinc-500">
              #{site.id} · 등록 {new Date(site.created_at).toLocaleString("ko-KR")}
            </p>
          )}
          {!isNew && (
            <button
              type="button"
              onClick={toggleDeposits}
              disabled={!siteNumber}
              title={siteNumber ? undefined : "현장번호를 입력·저장해야 입금내역을 볼 수 있습니다"}
              aria-pressed={view === "deposits"}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 ${
                view === "deposits"
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
              }`}
            >
              {view === "deposits" ? "← 상세정보" : "입금내역"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="닫기"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {view === "deposits" && siteNumber && (
        <div className="flex-1 overflow-y-auto">
          <DepositList
            siteNumber={siteNumber}
            deposits={deposits}
            loading={depositsLoading}
            error={depositError}
            onRetry={loadDeposits}
          />
        </div>
      )}

      <div className={`flex-1 space-y-6 overflow-y-auto px-5 py-5 ${view === "deposits" ? "hidden" : ""}`}>
        {syncNote && (
          <p role="status" className="whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {syncNote}
          </p>
        )}
        {SECTIONS.map((section) => (
          <fieldset key={section.title}>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">{section.title}</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {section.keys.map((key) => {
                if (isComputedField(key)) {
                  const value = site?.[key];
                  const info = COMPUTED_FIELDS[key];
                  return (
                    <div key={key}>
                      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-700">
                        {key}
                        <span
                          className="rounded bg-blue-50 px-1 py-px text-[10px] font-semibold text-blue-700"
                          title={info}
                        >
                          자동
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={isNew || !siteNumber}
                        onDoubleClick={() => siteNumber && setSourceField(key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && siteNumber) {
                            e.preventDefault();
                            setSourceField(key);
                          }
                        }}
                        title={`${info}\n더블클릭하면 상세 내역을 볼 수 있습니다`}
                        aria-label={`${key}: 더블클릭 또는 Enter로 상세 내역 보기`}
                        className="block w-full cursor-pointer select-none rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-right text-sm text-zinc-900 tabular-nums hover:border-blue-300 hover:bg-blue-50/50 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:outline-none disabled:cursor-default disabled:hover:border-zinc-200 disabled:hover:bg-zinc-50"
                      >
                        {isNew ? (
                          <span className="text-zinc-400">저장 후 계산</span>
                        ) : syncing ? (
                          <span className="text-zinc-400">계산 중…</span>
                        ) : value === null || value === undefined ? (
                          " "
                        ) : (
                          formatMoney(value)
                        )}
                      </button>
                    </div>
                  );
                }
                const type = FIELD_TYPE[key];
                const wide = key === "현장주소";
                const locked = key === "영업사원" && !!fixedSalesName;
                return (
                  <label key={key} className={wide ? "col-span-2" : undefined}>
                    <span className="mb-1 block text-xs font-medium text-zinc-700">
                      {key}
                      {REQUIRED.has(key) && <span className="ml-0.5 text-red-600">*</span>}
                    </span>
                    <input
                      name={key}
                      value={values[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      readOnly={locked}
                      title={locked ? "영업사원은 로그인한 본인으로 고정됩니다" : undefined}
                      onBlur={
                        type === "money"
                          ? () => {
                              const n = Number(values[key].replace(/[,\s원]/g, ""));
                              if (values[key].trim() && Number.isFinite(n)) setField(key, formatMoney(Math.round(n)));
                            }
                          : undefined
                      }
                      type={type === "date" ? "date" : type === "phone" ? "tel" : "text"}
                      inputMode={type === "money" || type === "phone" ? "numeric" : undefined}
                      className={`w-full rounded-md border border-zinc-300 ${locked ? "bg-zinc-100 text-zinc-600" : "bg-white"} px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                        type === "money" ? "text-right tabular-nums" : ""
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className={`border-t border-zinc-200 px-5 py-3 ${view === "deposits" ? "hidden" : ""}`}>
        {error && (
          <p role="alert" className="mb-3 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          {dirty && !isNew && (
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              되돌리기
            </button>
          )}
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {pending ? "저장 중…" : isNew ? "등록" : "저장"}
          </button>
        </div>
      </div>

      {sourceField && siteNumber && (
        <ComputedSourcesDialog siteNumber={siteNumber} field={sourceField} onClose={closeSources} />
      )}
    </form>
  );
}

"use client";

import { useEffect, useId, useState } from "react";

import { loadVendorPickerAction } from "@/app/knowledge-actions";
import { EMPTY_VENDOR_INFO, type VendorInfo, type VendorInfoKey } from "@/lib/deposits";
import type { KnowledgeRow, VendorPickerData } from "@/lib/knowledge-shared";

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v).trim());

/** 직접 입력 선택값 */
const MANUAL = "manual" as const;
type Choice = number | typeof MANUAL | null;

/**
 * 입금내역 컬럼 ← 화면 이름 (요약·입력 칸 순서).
 * 공정은 위에서 고른 값으로 고정되고, 나머지는 목록에서 골라도 모두 고칠 수 있다.
 */
export const VENDOR_INFO_LABELS: {
  key: VendorInfoKey;
  label: string;
  multiline?: boolean;
  tel?: boolean;
  /** 계좌 칸: main = 업체계좌, alt = 대체계좌 (고른 계좌의 칸만 보여주고 저장한다) */
  account?: AccountType;
}[] = [
  { key: "공정", label: "공정" },
  { key: "주요작업", label: "세부공정", multiline: true },
  { key: "업체", label: "업체" },
  { key: "업체담당자성함", label: "업체담당자 이름" },
  { key: "업체담당자연락처", label: "업체담당자 연락처", tel: true },
  { key: "업체은행", label: "은행명", account: "main" },
  { key: "업체예금주", label: "예금주", account: "main" },
  { key: "업체계좌번호", label: "계좌번호", account: "main" },
  { key: "대체계좌 은행", label: "대체계좌 은행", account: "alt" },
  { key: "대체계좌 예금주", label: "대체계좌 예금주", account: "alt" },
  { key: "대체계좌 번호", label: "대체계좌 번호", account: "alt" },
  { key: "업체비고", label: "업체비고", multiline: true },
];

export type AccountType = "main" | "alt";
const ACCOUNT_LABEL: Record<AccountType, string> = { main: "업체계좌", alt: "대체계좌" };
const accountKeys = (t: AccountType) => VENDOR_INFO_LABELS.filter((l) => l.account === t).map((l) => l.key);

/** 저장된 거래처 정보가 어느 계좌를 쓰는지: 대체계좌 값이 있으면 대체계좌, 아니면 업체계좌 */
export function accountTypeOf(info: VendorInfo): AccountType {
  return accountKeys("alt").some((k) => info[k]?.trim()) ? "alt" : "main";
}

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** 공정별거래처 한 행 → 입금내역에 저장할 거래처 정보 (세부 업무가 없으면 공정표의 주요 작업) */
function rowToInfo(process: string, row: KnowledgeRow, fallbackWork: string | null | undefined): VendorInfo {
  return {
    공정: process,
    주요작업: str(row["세부 업무"]) || str(fallbackWork),
    업체: str(row.업체),
    업체담당자성함: str(row.업체담당자성함),
    업체담당자연락처: str(row.업체담당자연락처),
    업체은행: str(row.업체은행),
    업체예금주: str(row.업체예금주),
    업체계좌번호: str(row.업체계좌번호),
    "대체계좌 은행": str(row["대체계좌 은행"]),
    "대체계좌 예금주": str(row["대체계좌 예금주"]),
    "대체계좌 번호": str(row["대체계좌 번호"]),
    업체비고: str(row.업체비고),
  };
}

/**
 * 거래처 정보 등록 팝업 (입금 등록·수정 화면).
 * 1) 공정표의 공정 중 하나를 고르고 2) 그 공정의 공정별거래처 행 중 하나를 고르거나, 없으면 직접 입력한다.
 * 고른(입력한) 값은 아래 요약에 보여주고, '선택'을 누르면 입금내역의 공정·주요작업·업체… 컬럼 값으로 넘긴다.
 */
export function VendorPickerDialog({
  current,
  onSelect,
  onClose,
}: {
  /** 이미 등록한 거래처 정보 (다시 열 때 그 공정·업체를 미리 선택) */
  current: VendorInfo;
  onSelect: (info: VendorInfo) => void;
  onClose: () => void;
}) {
  const idp = useId();
  const [initial] = useState(current); // 처음 열 때의 값 (다시 불러오지 않도록 고정)
  const [data, setData] = useState<VendorPickerData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [process, setProcess] = useState(current.공정);
  const [choice, setChoice] = useState<Choice>(null);
  /** 저장할 값 (목록에서 고르면 그 행 값으로 채우고 공정 외 모든 칸을 고칠 수 있다. 직접 입력이면 모두 입력) */
  const [form, setForm] = useState<VendorInfo>(current);
  /** 직접 입력하던 값 (목록 선택과 오가도 잃지 않게) */
  const [manual, setManual] = useState<VendorInfo>(current);
  /** 입금할 계좌: 업체계좌 / 대체계좌 (다시 열면 저장된 값으로 판단) */
  const [accountType, setAccountType] = useState<AccountType>(() => accountTypeOf(current));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadVendorPickerAction().then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setData(res.data);
      if (!initial.공정) return;
      // 이미 등록한 업체가 공정별거래처에 있으면 그 행을, 없으면 직접 입력을 선택해 둔다
      const prev = res.data.vendors.find(
        (v) =>
          str(v.공정) === initial.공정 &&
          str(v.업체) === initial.업체 &&
          str(v.업체담당자성함) === initial.업체담당자성함,
      );
      setChoice(prev ? prev.id : MANUAL); // form은 처음 값(이전에 고친 담당자·계좌 포함) 그대로
    });
    return () => {
      alive = false;
    };
  }, [initial]);

  const processInfo = data?.processes.find((p) => p.공정 === process) ?? null;
  const vendors = data && process ? data.vendors.filter((v) => str(v.공정) === process) : [];
  const chosenRow = typeof choice === "number" ? (vendors.find((v) => v.id === choice) ?? null) : null;
  // 공정표에 없는 기존 값(이름이 바뀐 공정 등)도 선택 목록에 남겨 둔다
  const keepCurrent = data && initial.공정 && !data.processes.some((p) => p.공정 === initial.공정) ? initial.공정 : null;

  // 입금내역에 저장될 값
  const result: VendorInfo | null = process && (chosenRow || choice === MANUAL) ? { ...form, 공정: process } : null;

  function setField(key: VendorInfoKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (choice === MANUAL) setManual((m) => ({ ...m, [key]: value }));
  }

  function chooseRow(row: KnowledgeRow) {
    setError(null);
    setChoice(row.id);
    const info = rowToInfo(process, row, processInfo?.주요작업);
    setForm(info);
    // 업체계좌가 비어 있고 대체계좌만 있는 거래처면 대체계좌를 골라 둔다 (언제든 바꿀 수 있음)
    const hasMain = accountKeys("main").some((k) => info[k].trim());
    if (!hasMain && accountTypeOf(info) === "alt") setAccountType("alt");
  }

  function chooseManual() {
    setError(null);
    setChoice(MANUAL);
    // 처음 직접 입력을 고르면 세부공정에 공정표의 주요 작업을 넣어 둔다 (고칠 수 있음)
    const next = manual.업체 || manual.주요작업 ? manual : { ...EMPTY_VENDOR_INFO, 주요작업: str(processInfo?.주요작업) };
    setManual(next);
    setForm(next);
  }

  function confirm() {
    if (!result) return;
    // 업체명은 선택 사항 (공정별거래처에 업체명 없이 등록된 행도 고를 수 있다)
    const trimmed = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.trim()])) as VendorInfo;
    // 고르지 않은 계좌의 칸은 비워서 저장한다 (저장된 값만 보고 어느 계좌로 보낼지 알 수 있게)
    for (const k of accountKeys(accountType === "main" ? "alt" : "main")) trimmed[k] = "";
    onSelect(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // 뒤의 입금 등록 화면까지 닫히지 않게
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idp}-title`}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id={`${idp}-title`} className="text-lg font-semibold text-zinc-900">
              거래처 정보 등록
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              공정을 고른 뒤 거래처를 선택하세요. 목록에 없으면 &lsquo;직접 입력&rsquo;을 고르세요.
            </p>
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loadError ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          ) : !data ? (
            <p className="py-8 text-center text-sm text-zinc-500">공정표·공정별거래처를 불러오는 중…</p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-700">
                  1. 공정<span className="ml-0.5 text-red-600">*</span>
                </span>
                <select
                  value={process}
                  onChange={(e) => {
                    setProcess(e.target.value);
                    setError(null);
                    // 다른 공정의 거래처 선택은 풀고, 직접 입력 중이면 그대로 둔다
                    setChoice((c) => (c === MANUAL ? c : null));
                  }}
                  autoFocus
                  className={INPUT}
                >
                  <option value="" disabled>
                    공정표의 공정 {data.processes.length}개 중 선택
                  </option>
                  {keepCurrent && <option value={keepCurrent}>{keepCurrent} (현재 값)</option>}
                  {data.processes.map((p) => {
                    const n = data.vendors.filter((v) => str(v.공정) === p.공정).length;
                    return (
                      <option key={p.공정} value={p.공정}>
                        {p.공정} ({n}건)
                      </option>
                    );
                  })}
                </select>
                {processInfo?.주요작업 && (
                  <span className="mt-1 block whitespace-pre-line text-xs text-zinc-500">주요 작업: {processInfo.주요작업}</span>
                )}
              </label>

              {process && (
                <fieldset>
                  <legend className="mb-1 text-xs font-medium text-zinc-700">
                    2. 거래처 <span className="font-normal text-zinc-500">(공정별거래처 · {vendors.length}건)</span>
                    <span className="ml-0.5 text-red-600">*</span>
                  </legend>
                  <ul className="space-y-2">
                    {vendors.length === 0 && (
                      <li className="rounded-md bg-zinc-50 px-3 py-3 text-center text-sm text-zinc-500">
                        공정별거래처에 이 공정의 거래처가 없습니다. 아래 &lsquo;직접 입력&rsquo;으로 입력하세요.
                      </li>
                    )}
                    {vendors.map((v) => (
                      <VendorOption
                        key={v.id}
                        name={`${idp}-vendor`}
                        vendor={v}
                        checked={choice === v.id}
                        onChoose={() => chooseRow(v)}
                      />
                    ))}
                    <li>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm ${
                          choice === MANUAL
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                            : "border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${idp}-vendor`}
                          checked={choice === MANUAL}
                          onChange={chooseManual}
                          className="accent-blue-600"
                        />
                        <span className="font-medium text-zinc-800">직접 입력</span>
                        <span className="text-xs text-zinc-500">해당하는 업체가 목록에 없을 때</span>
                      </label>
                    </li>
                  </ul>
                </fieldset>
              )}

              {result && (
                <section className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <h3 className="mb-2 text-xs font-semibold text-zinc-600">
                    {choice === MANUAL ? "거래처 정보 직접 입력" : "선택한 거래처 정보"}
                    <span className="ml-1 font-normal text-zinc-500">· 입금내역에 이 값으로 저장됩니다. 각 항목을 고칠 수 있습니다 (공정별거래처 원본은 바뀌지 않음)</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {VENDOR_INFO_LABELS.map(({ key, label, multiline, tel, account }) => {
                      // 계좌 칸: 고른 계좌의 칸만 보여주고, 첫 계좌 칸 자리에 업체계좌/대체계좌 선택을 둔다
                      if (account && account !== accountType) return null;
                      const accountPicker =
                        account && key === accountKeys(accountType)[0] ? (
                          <fieldset key="account-type" className="sm:col-span-2">
                            <legend className="mb-1 text-xs font-medium text-zinc-700">계좌 선택</legend>
                            <div className="flex gap-2" role="radiogroup">
                              {(["main", "alt"] as const).map((t) => {
                                const filled = accountKeys(t).some((k) => form[k].trim());
                                return (
                                  <label
                                    key={t}
                                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${
                                      accountType === t
                                        ? "border-blue-500 bg-blue-50 text-blue-800"
                                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`${idp}-account`}
                                      checked={accountType === t}
                                      onChange={() => setAccountType(t)}
                                      className="accent-blue-600"
                                    />
                                    {ACCOUNT_LABEL[t]}
                                    {!filled && <span className="text-xs font-normal text-zinc-400">(정보 없음)</span>}
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        ) : null;
                      // 공정 외 모두 입력·수정 가능 (목록에서 고른 경우 그 행 값으로 채워진 상태에서 고친다)
                      const editable = key !== "공정";
                      const wide = multiline ? "sm:col-span-2" : undefined;
                      if (!editable) {
                        return (
                          <div key={key} className={wide}>
                            <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
                            <p className="min-h-[2.125rem] whitespace-pre-line break-words rounded-md bg-zinc-100 px-2.5 py-1.5 text-sm text-zinc-800">
                              {result[key].trim() || <span className="text-zinc-400">-</span>}
                            </p>
                          </div>
                        );
                      }
                      const field = (
                        <label key={key} className={wide}>
                          <span className="mb-1 block text-xs font-medium text-zinc-700">
                            {label}
                          </span>
                          {multiline ? (
                            <textarea
                              value={form[key]}
                              onChange={(e) => setField(key, e.target.value)}
                              rows={2}
                              maxLength={2000}
                              className={`${INPUT} resize-y`}
                            />
                          ) : (
                            <input
                              value={form[key]}
                              onChange={(e) => setField(key, e.target.value)}
                              type={tel ? "tel" : "text"}
                              maxLength={200}
                              placeholder={choice === MANUAL ? undefined : "없으면 직접 입력"}
                              className={INPUT}
                            />
                          )}
                        </label>
                      );
                      return accountPicker ? [accountPicker, field] : field;
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="border-t border-zinc-200 px-5 py-3">
          {error && (
            <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!result}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {choice === MANUAL ? "입력 완료" : "선택"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 거래처 정보 요약 (공정 / 세부공정 / 업체 / 담당자 / 연락처 / 업체비고) */
export function VendorInfoSummary({ info }: { info: VendorInfo }) {
  const type = accountTypeOf(info);
  return (
    <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
      <div className="contents">
        <dt className="text-zinc-500">계좌</dt>
        <dd className="font-medium text-zinc-900">{ACCOUNT_LABEL[type]}</dd>
      </div>
      {/* 고른 계좌의 칸만 보여준다 */}
      {VENDOR_INFO_LABELS.filter((l) => !l.account || l.account === type).map(({ key, label }) => (
        <div key={key} className="contents">
          <dt className="text-zinc-500">{label}</dt>
          <dd className={`min-w-0 whitespace-pre-line break-words ${key === "공정" || key === "업체" ? "font-medium text-zinc-900" : "text-zinc-700"}`}>
            {info[key].trim() || <span className="text-zinc-300">-</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VendorOption({
  name,
  vendor: v,
  checked,
  onChoose,
}: {
  name: string;
  vendor: KnowledgeRow;
  checked: boolean;
  onChoose: () => void;
}) {
  const person = [str(v.업체담당자성함), str(v.직책)].filter(Boolean).join(" ");
  const account = [str(v.업체은행), str(v.업체계좌번호), str(v.업체예금주)].filter(Boolean).join(" ");
  const altAccount = [str(v["대체계좌 은행"]), str(v["대체계좌 번호"]), str(v["대체계좌 예금주"])].filter(Boolean).join(" ");
  return (
    <li>
      <label
        className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-sm ${
          checked ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20" : "border-zinc-200 hover:bg-zinc-50"
        }`}
      >
        <input type="radio" name={name} checked={checked} onChange={onChoose} className="mt-1 accent-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-zinc-900">{str(v.업체) || "(업체명 없음)"}</span>
            {person && <span className="text-zinc-700">{person}</span>}
            {str(v.업체담당자연락처) && <span className="tabular-nums text-zinc-600">{str(v.업체담당자연락처)}</span>}
            {str(v.구분) && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{str(v.구분)}</span>}
          </div>
          {str(v["세부 업무"]) && <p className="mt-0.5 whitespace-pre-line text-zinc-600">세부 업무: {str(v["세부 업무"])}</p>}
          {str(v.업체비고) && <p className="mt-0.5 whitespace-pre-line text-xs text-zinc-500">비고: {str(v.업체비고)}</p>}
          {account && <p className="mt-0.5 text-xs text-zinc-500">계좌: {account}</p>}
          {altAccount && <p className="mt-0.5 text-xs text-zinc-500">대체계좌: {altAccount}</p>}
          {str(v["계좌 사용 구분"]) && <p className="mt-0.5 text-xs text-zinc-500">계좌 사용: {str(v["계좌 사용 구분"])}</p>}
        </div>
      </label>
    </li>
  );
}

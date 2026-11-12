"use client";

import { useId, useState, useTransition } from "react";

import { createDepositAction, resubmitRequestAction, updateDepositAction } from "@/app/actions";
import { uploadReceiptAction } from "@/app/receipt-actions";
import { formatFileSize, isBlockedFile } from "@/lib/board-shared";
import { parseReceipt, RECEIPT_MAX_BYTES } from "@/lib/receipt-files-shared";
import type { RequestKind } from "@/lib/approvals";
import {
  AS_MAX_LENGTH,
  CASH_RECEIPT_NOT_NEEDED,
  CASH_RECEIPT_OPTIONS,
  CASH_RECEIPT_REASON_MAX_LENGTH,
  CATEGORY_RULES,
  DEPOSIT_CATEGORIES,
  DEPOSIT_KINDS,
  depositCategoryOf,
  depositToInput,
  EMPTY_VENDOR_INFO,
  VENDOR_INFO_COLUMNS,
  receiptAllowed,
  VAT_DEFAULT,
  VAT_OPTIONS,
  vatChoiceRequired,
  vendorInfoAllowed,
  type Deposit,
  type DepositCategory,
  type DepositInput,
  type VendorInfo,
} from "@/lib/deposits";
import { formatMoney, type SiteSummary } from "@/lib/sites";

import { accountTypeOf, VendorInfoSummary, VendorPickerDialog } from "./vendor-picker-dialog";

/** 기기의 현재 날짜·시간 (입력 칸 형식) */
function nowLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DepositFormDialog({
  sites,
  fixedSalesName = null,
  loginName = null,
  isAdmin = false,
  editing = null,
  resubmit = null,
  onClose,
  onDone,
}: {
  sites: SiteSummary[];
  fixedSalesName?: string | null;
  /** 로그인한 사용자 이름: 현장정보에서 이 이름이 영업사원인 현장번호만 선택 목록에 보여준다 */
  loginName?: string | null;
  /** CEO·관리자: 진행 중인 전체 현장에서 선택 */
  isAdmin?: boolean;
  /** 값이 있으면 이 입금내역의 수정 요청 화면 */
  editing?: Deposit | null;
  /** 반려된 승인 요청을 고쳐 다시 요청하는 화면 (editing에는 그 요청 내용을 넘긴다) */
  resubmit?: { requestId: number; kind: RequestKind; comment: string | null } | null;
  onClose: () => void;
  /** 승인 요청 완료 (안내 문구 전달) */
  onDone: (message: string) => void;
}) {
  const idp = useId();
  const isEdit = editing !== null && (!resubmit || resubmit.kind === "수정");
  const [values, setValues] = useState<DepositInput>(() =>
    editing
      ? { ...depositToInput(editing), ...(fixedSalesName && { 영업사원: fixedSalesName }) }
      : {
          현장번호: "",
          고객명: "",
          영업사원: fixedSalesName ?? "",
          구분: "",
          입출금: "",
          입금액: "",
          날짜: nowLocal(),
          입금내용: "",
          거래처: "",
          현금영수증: "",
          현금영수증사유: "",
          부가세포함: VAT_DEFAULT,
          영수증: "",
          "A/S": "",
          ...EMPTY_VENDOR_INFO,
        },
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // 현금영수증 발급불필요: 세부 사유를 받아 비고 맨 끝 줄에 붙인다 (수정에서 '기존 값 유지'인 기존 발급불필요 행 포함)
  const notNeeded =
    values.현금영수증 === CASH_RECEIPT_NOT_NEEDED ||
    (isEdit && !values.현금영수증 && editing?.현금영수증 === CASH_RECEIPT_NOT_NEEDED);
  const vendorInfo = Object.fromEntries(VENDOR_INFO_COLUMNS.map((c) => [c, values[c]])) as VendorInfo;
  // 공정만 있으면 거래처 정보를 등록한 것으로 본다 (업체명은 없을 수 있음)
  const hasVendor = !!values.공정.trim();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof DepositInput, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const matchedSite = sites.find((s) => s.현장번호 === values.현장번호.trim()) ?? null;
  // 로그인한 영업사원의 현장 (현장정보.영업사원 = 로그인 이름). 없으면(예: CEO·관리자) 전체 목록에서 입력
  const me = loginName?.trim();
  // 관리자는 진행 중(완료일 없음)인 전체 현장, 그 외는 본인 현장
  const mySites = isAdmin
    ? sites.filter((s) => s.현장번호 && !s.완료일)
    : me
      ? sites.filter((s) => s.현장번호 && s.영업사원?.trim() === me)
      : [];
  const selectMode = mySites.length > 0;
  // 수정 화면에서 기존 현장번호가 본인 목록에 없으면 선택지에 그대로 남겨 둔다
  const keepCurrent =
    selectMode && values.현장번호.trim() && !mySites.some((s) => s.현장번호 === values.현장번호.trim())
      ? values.현장번호
      : null;

  function onSiteNumberChange(value: string) {
    const site = sites.find((s) => s.현장번호 === value.trim());
    setValues((v) => ({
      ...v,
      현장번호: value,
      // 현장정보에 있는 번호면 고객명/영업사원을 채운다 (이후 직접 수정 가능)
      ...(site && {
        고객명: site.고객명 ?? "",
        영업사원: fixedSalesName ?? site.영업사원 ?? "",
      }),
    }));
  }

  // 입금구분 선택에 따라 입출금이 정해진다 (한샘물대·한샘시공비 = 입금, 한샘 외 시공비 = 출금)
  const rule = (DEPOSIT_CATEGORIES as readonly string[]).includes(values.구분)
    ? CATEGORY_RULES[values.구분 as DepositCategory]
    : null;
  const needsKind = rule?.입출금 === null; // 홈씨씨창호: 입금/출금을 직접 선택 (필수)
  const kind = rule ? (rule.입출금 ?? values.입출금) : "";
  // 거래처 정보는 출금일 때만 보여준다 (입금이면 숨기고, 입력해 둔 값은 저장 시 서버에서 비움)
  const showVendor = vendorInfoAllowed(kind);
  // 영수증은 입금일 때만 보여준다 (출금이면 숨기고, 서버에서도 받지 않음)
  const showReceipt = receiptAllowed(kind);
  const needsContent = rule?.입금내용 === null; // 한샘 외 시공비, 거래처환불
  const needsVendor = rule?.입금자 === "vendor"; // 거래처환불
  // 저장될 입금자 미리보기 (실제 값은 서버에서 정함: 한샘물대·한샘시공비 = 현장정보 고객명, 그 외 = 나비지급)
  const payerPreview = rule
    ? rule.입금자 === "customer"
      ? matchedSite?.고객명 || values.고객명.trim() || "(고객명)"
      : rule.입금자 === "vendor"
        ? values.거래처.trim() || "(거래처)"
        : rule.입금자
    : null;
  // 화면 구분에 해당하지 않는 기존 행(예: 거래처환불입금)을 수정할 때 안내
  const legacy = editing && !depositCategoryOf(editing) ? `${editing.입금구분 ?? ""} / ${editing.입금내용 ?? ""}` : null;

  function formatAmountOnBlur() {
    const n = Number(values.입금액.replace(/[,\s원]/g, ""));
    if (values.입금액.trim() && Number.isFinite(n)) set("입금액", formatMoney(Math.round(n)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = resubmit
        ? await resubmitRequestAction(resubmit.requestId, values)
        : editing
          ? await updateDepositAction(editing.id, values)
          : await createDepositAction(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const label = `${values.구분} ${values.입금액}원`;
      onDone(
        resubmit
          ? `${label} 다시 승인 요청했습니다`
          : isEdit
          ? `${label} 수정을 요청했습니다. 승인 후 반영됩니다`
          : `${label}을 승인 요청했습니다. 승인 후 입금내역에 반영됩니다`,
      );
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && !pending && !pickerOpen && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idp}-title`}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id={`${idp}-title`} className="text-lg font-semibold text-zinc-900">
              {resubmit ? `반려된 ${resubmit.kind} 요청 다시 요청` : isEdit ? "입금 수정" : "입금 등록"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {resubmit
                ? "관리자 의견을 반영해 고친 뒤 다시 승인 요청하세요."
                : isEdit
                  ? "수정 내용은 관리자 승인 후 입금내역에 반영됩니다."
                  : "등록한 내역은 관리자 승인 후 입금내역에 반영됩니다."}
            </p>
          </div>
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
          {resubmit?.comment && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="text-xs font-semibold">관리자 의견 (반려 사유)</p>
              <p className="mt-0.5 whitespace-pre-line">{resubmit.comment}</p>
            </div>
          )}
          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">현장</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="col-span-2">
                <Label required>현장번호</Label>
                {selectMode ? (
                  <select
                    value={values.현장번호}
                    onChange={(e) => onSiteNumberChange(e.target.value)}
                    required
                    autoFocus
                    className={INPUT}
                  >
                    <option value="" disabled>
                      {isAdmin ? `진행 중인 현장 ${mySites.length}건 중 선택` : `${me}님의 현장 ${mySites.length}건 중 선택`}
                    </option>
                    {keepCurrent && <option value={keepCurrent}>{keepCurrent} (현재 값)</option>}
                    {mySites.map((s) => (
                      <option key={s.현장번호} value={s.현장번호 ?? ""}>
                        {[s.현장번호, s.고객명, isAdmin && s.영업사원].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
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
                  </>
                )}
                <span className={`mt-1 block text-xs ${matchedSite ? "text-emerald-700" : "text-zinc-400"}`}>
                  {matchedSite
                    ? "현장정보에서 고객명·영업사원을 채웠습니다"
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
                <input
                  value={values.영업사원}
                  onChange={(e) => set("영업사원", e.target.value)}
                  readOnly={!!fixedSalesName}
                  title={fixedSalesName ? "영업사원은 로그인한 본인으로 고정됩니다" : undefined}
                  className={`${INPUT}${fixedSalesName ? " bg-zinc-100! text-zinc-600!" : ""}`}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">입금 정보</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="col-span-2">
                <Label required>입금구분</Label>
                <select
                  value={values.구분}
                  onChange={(e) => {
                    const 구분 = e.target.value;
                    // 대체계좌 거래처를 먼저 골라 둔 뒤 한샘 외 시공비로 바꿔도 부가세는 미포함
                    setValues((v) => ({
                      ...v,
                      구분,
                      ...(vatChoiceRequired(구분) && !vatChoiceRequired(v.구분) && accountTypeOf(vendorInfo) === "alt"
                        ? { 부가세포함: "미포함" }
                        : {}),
                    }));
                  }}
                  required
                  className={INPUT}
                >
                  <option value="" disabled>
                    선택하세요
                  </option>
                  {DEPOSIT_CATEGORIES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-zinc-500">
                  {rule ? (
                    <>
                      입출금:{" "}
                      <span
                        className={`font-semibold ${
                          kind === "입금" ? "text-emerald-700" : kind === "출금" ? "text-red-600" : "text-zinc-400"
                        }`}
                      >
                        {kind || "(아래에서 선택)"}
                      </span>
                      {" · "}입금자: <span className="font-semibold text-zinc-700">{payerPreview}</span>
                    </>
                  ) : legacy ? (
                    <span className="text-amber-700">기존 값({legacy})은 선택 목록에 없습니다. 다시 선택하세요</span>
                  ) : (
                    " "
                  )}
                </span>
              </label>
              <label className="col-span-2">
                <Label required>금액</Label>
                <input
                  value={values.입금액}
                  onChange={(e) => set("입금액", e.target.value)}
                  onBlur={formatAmountOnBlur}
                  inputMode="numeric"
                  placeholder="0"
                  required
                  className={`${INPUT} text-right tabular-nums`}
                />
              </label>
              {needsKind && (
                <fieldset className="col-span-2 sm:col-span-4">
                  <legend className="mb-1 text-xs font-medium text-zinc-700">
                    입금/출금<span className="ml-0.5 text-red-600">*</span>
                  </legend>
                  <div className="flex gap-2">
                    {DEPOSIT_KINDS.map((k) => (
                      <label
                        key={k}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${
                          values.입출금 === k
                            ? k === "입금"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                              : "border-red-400 bg-red-50 text-red-700"
                            : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${idp}-kind`}
                          value={k}
                          checked={values.입출금 === k}
                          onChange={() => set("입출금", k)}
                          required
                          className="accent-blue-600"
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {needsVendor && (
                <label className="col-span-2 sm:col-span-4">
                  <Label required>거래처</Label>
                  <input
                    value={values.거래처}
                    onChange={(e) => set("거래처", e.target.value)}
                    placeholder="환불해 준 거래처 이름 (입금자로 저장)"
                    required
                    className={INPUT}
                  />
                </label>
              )}
              {needsContent && (
                <label className="col-span-2 sm:col-span-4">
                  <Label required>입금내용</Label>
                  <input
                    value={values.입금내용}
                    onChange={(e) => set("입금내용", e.target.value)}
                    placeholder="예: 도막방수제, 전기작업"
                    required
                    className={INPUT}
                  />
                </label>
              )}
              <label className="col-span-2">
                <Label required>날짜·시간</Label>
                <input
                  type="datetime-local"
                  value={values.날짜}
                  onChange={(e) => set("날짜", e.target.value)}
                  required
                  className={INPUT}
                />
              </label>
              {vatChoiceRequired(values.구분) && (
                <label className="col-span-2">
                  <Label required>부가세 포함</Label>
                  <select value={values.부가세포함} onChange={(e) => set("부가세포함", e.target.value)} required className={INPUT}>
                    {VAT_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {vatChoiceRequired(values.구분) && (
                <ReceiptUpload value={values.영수증} onChange={(v) => set("영수증", v)} disabled={pending} />
              )}
              {showReceipt && (
              <label className="col-span-2">
                <Label required={!isEdit}>영수증</Label>
                <select
                  value={values.현금영수증}
                  onChange={(e) => set("현금영수증", e.target.value)}
                  required={!isEdit}
                  className={INPUT}
                >
                  {isEdit && editing ? (
                    <option value="">기존 값 유지{editing.현금영수증 ? ` (${editing.현금영수증})` : " (없음)"}</option>
                  ) : (
                    <option value="" disabled>
                      선택하세요
                    </option>
                  )}
                  {CASH_RECEIPT_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              )}
              {showReceipt && notNeeded && (
                <label className="col-span-2 sm:col-span-4">
                  <Label required>발급불필요 사유</Label>
                  <input
                    value={values.현금영수증사유}
                    onChange={(e) => set("현금영수증사유", e.target.value)}
                    maxLength={CASH_RECEIPT_REASON_MAX_LENGTH}
                    placeholder="예: 사업자 세금계산서 발행, 고객이 발급 원하지 않음"
                    required
                    className={INPUT}
                  />
                  <span className="mt-1 block text-xs text-zinc-500">비고 맨 끝 줄에 붙여 저장됩니다</span>
                </label>
              )}
              <label className="col-span-2 sm:col-span-4">
                <Label>비고</Label>
                <textarea
                  value={values["A/S"]}
                  onChange={(e) => set("A/S", e.target.value)}
                  maxLength={AS_MAX_LENGTH}
                  rows={2}
                  placeholder="참고할 내용이 있으면 입력하세요 (선택)"
                  className={`${INPUT} resize-y`}
                />
              </label>
            </div>
          </fieldset>
          {/* 거래처 정보는 출금일 때만 */}
          {showVendor && (
          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">
              거래처 정보
              <span className="ml-1 font-normal text-zinc-400">(선택)</span>
            </legend>
            {hasVendor ? (
              <div className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <VendorInfoSummary info={vendorInfo} />
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                >
                  변경
                </button>
                <button
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, ...EMPTY_VENDOR_INFO }))}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  지우기
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                + 거래처 정보 등록{" "}
                <span className="font-normal opacity-80">(선택 · 공정과 거래처를 선택하거나 직접 입력)</span>
              </button>
            )}
          </fieldset>
          )}
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
              {pending ? "요청 중…" : resubmit ? "다시 승인 요청" : "승인 요청"}
            </button>
          </div>
        </div>
      </form>
      {pickerOpen && (
        <VendorPickerDialog
          current={vendorInfo}
          onClose={() => setPickerOpen(false)}
          onSelect={(info) => {
            // 한샘 외 시공비에서 대체계좌로 입금하면 부가세는 미포함 (업체계좌로 바꿔도 자동으로 되돌리지 않는다)
            setValues((v) => ({
              ...v,
              ...info,
              ...(vatChoiceRequired(v.구분) && accountTypeOf(info) === "alt" ? { 부가세포함: "미포함" } : {}),
            }));
            setPickerOpen(false);
          }}
        />
      )}
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

/** 한샘 외 시공비 영수증: 고르면 바로 서버에 올리고, 받은 파일 정보를 입력값에 넣는다 (승인 요청 때 함께 저장) */
function ReceiptUpload({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const info = parseReceipt(value);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (isBlockedFile(file.name)) return setError("실행 파일 형식은 올릴 수 없습니다");
    if (file.size > RECEIPT_MAX_BYTES) return setError(`파일은 ${formatFileSize(RECEIPT_MAX_BYTES)}까지 올릴 수 있습니다`);
    const formData = new FormData();
    formData.set("file", file);
    startUpload(async () => {
      const res = await uploadReceiptAction(formData);
      if (res.ok) onChange(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="col-span-2">
      <Label>영수증 업로드</Label>
      <div className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm">
        <span className="min-w-0 flex-1 truncate text-zinc-800" title={info?.name}>
          {uploading ? "올리는 중…" : info ? `${info.name} (${formatFileSize(info.size)})` : <span className="text-zinc-400">파일 없음</span>}
        </span>
        <label
          className={`shrink-0 cursor-pointer rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ${
            disabled || uploading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {info ? "변경" : "파일 선택"}
          <input
            type="file"
            accept="image/*,.pdf"
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = ""; // 같은 파일을 다시 선택해도 동작하도록
            }}
          />
        </label>
        {info && !uploading && (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            지우기
          </button>
        )}
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}

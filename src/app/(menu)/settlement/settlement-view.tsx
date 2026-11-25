"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  cancelRdPublishAction,
  computeSettlementAction,
  getRdPublishAction,
  listRdPublishAction,
  publishRdAction,
  getSettlementHistoryDetailAction,
  listSettlementHistoryAction,
  saveSettlementAction,
  saveWorkerRatesAction,
  updateRdPublishPeriodAction,
  type RdPublish,
  type AppliedRates,
  type CarryIn,
  type SavedSettlement,
  type SettlementExtraCostDeduction,
  type SettlementHistoryRow,
  type SettlementWithCarryIn,
} from "@/app/settlement-actions";
import { countUnansweredOpinionsAction } from "@/app/settlement-opinion-actions";
import { opinionKey } from "@/lib/settlement-opinions-shared";
import type { SettlementCandidate, SettlementDeposit, SettlementExtraCost, SettlementLine } from "@/lib/settlement";
import { UPLOAD_TABLE_KEYS, UPLOAD_TABLES, type UploadTable } from "@/lib/settlement-upload";
import {
  DEDUCTION,
  extraCostDeduction,
  netOutflowParts,
  netProfit,
  outflowParts,
  outflowRows,
  rowsSum,
  DEFAULT_WORKER_RATES,
  summarizeSettlement,
  workerShare,
  workerShareBreakdown,
  type OutflowGroup,
  type SettlementSummaryValues,
  type WorkerRates,
} from "@/lib/settlement-calc";
import { formatMoney, toMoney, withoutVat, withVat } from "@/lib/sites";

import { OpinionThread } from "./opinion-thread";
import { SettlementUploadDialog } from "./settlement-upload-dialog";

/** 상세 팝업 대상: 총입금액 또는 총출금액의 한 묶음 */
type DetailGroup = "입금" | OutflowGroup;

const GROUP_LABEL: Record<DetailGroup, string> = {
  입금: "입금",
  한샘: "한샘(부가세포함)",
  홈씨씨: "홈씨씨(부가세포함)",
  시공비포함: "시공비(한샘외) 부가세포함",
  시공비미포함: "시공비(한샘외) 부가세미포함",
  기타: "기타",
};

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

function options(values: (string | null)[]) {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))];
}

function monthOptionsOf(sites: SettlementCandidate[]) {
  return options(sites.map((s) => s.정산월)).sort((a, b) => monthOrder(a) - monthOrder(b) || a.localeCompare(b, "ko"));
}


function Money({ value }: { value: number | null }) {
  return value === null ? <span className="text-zinc-300">-</span> : formatMoney(value);
}

type RateKey = keyof WorkerRates;
const RATE_KEYS: readonly RateKey[] = ["upTo5m", "upTo10m", "over10m"];
const RATE_LABEL: Record<RateKey, string> = {
  upTo5m: "월 이익 500만원 이하 구간",
  upTo10m: "월 이익 500만원 초과 1,000만원 이하 구간",
  over10m: "월 이익 1,000만원 초과 구간",
};

/** 근로자 비율 입력값 → 0~100 숫자 (아니면 null) */
function parseRate(text: string): number | null {
  const s = text.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : null;
}

const rateTexts = (r: WorkerRates): Record<RateKey, string> => ({
  upTo5m: String(r.upTo5m),
  upTo10m: String(r.upTo10m),
  over10m: String(r.over10m),
});

/** 정산금액 계산 과정: 정산대상금액을 구간별로 나눠 근로자 비율을 곱하고 더한다 */
function ShareBreakdown({
  target,
  settlement,
  carryOver,
  rates,
}: {
  target: number;
  settlement: number;
  carryOver: number;
  rates: WorkerRates;
}) {
  if (target < 0) {
    return (
      <div className="mt-1 rounded-md bg-zinc-50 px-3 py-2">
        <p className="font-semibold text-zinc-700">정산금액 계산 과정</p>
        <p className="mt-0.5">
          정산대상금액 {formatMoney(target)}원이 마이너스라 정산금액은 0원이고, {formatMoney(carryOver)}원은 이월금액(다음 달로 넘어가는 누적이월금)이
          됩니다.
        </p>
      </div>
    );
  }
  const tiers = workerShareBreakdown(target, rates);
  const tierSum = tiers.reduce((acc, t) => acc + t.amount, 0);
  return (
    <div className="mt-1 rounded-md bg-zinc-50 px-3 py-2">
      <p className="font-semibold text-zinc-700">
        정산금액 계산 과정 <span className="font-normal text-zinc-500">(정산대상금액 {formatMoney(target)}원)</span>
      </p>
      <table className="mt-1 text-xs tabular-nums">
        <tbody>
          {tiers.map((t) => (
            <tr key={t.label} className={t.base === 0 ? "text-zinc-400" : "text-zinc-700"}>
              <td className="py-0.5 pr-3">{t.label}</td>
              <td className="py-0.5 pr-1 text-right">{formatMoney(t.base)}원</td>
              <td className="px-1 py-0.5">× {t.rate}%</td>
              <td className="py-0.5 pl-1 text-right">= {formatMoney(t.amount)}원</td>
            </tr>
          ))}
          <tr className="border-t border-zinc-200 font-semibold text-zinc-900">
            <td className="pt-1 pr-3">정산금액</td>
            <td colSpan={2} />
            <td className="pt-1 pl-1 text-right">= {formatMoney(settlement)}원</td>
          </tr>
        </tbody>
      </table>
      {tierSum !== settlement && <p className="mt-0.5 text-zinc-500">구간별 금액은 원 단위로 반올림해 표시하므로 합계와 1원 정도 다를 수 있습니다.</p>}
    </div>
  );
}

/** 이익금액 합계에서 공제금을 뺀 정산대상금액과, 그 결과인 이월금액 또는 정산금액. 정산정보 테이블에 저장한다 */
function SettlementSummary({
  lines,
  ids,
  carryIn,
  extraCost,
  rates,
  readOnly = false,
  fixedSummary = null,
  rdRates = null,
}: {
  lines: SettlementLine[];
  ids: number[];
  carryIn: CarryIn | null;
  /** 정산월 전달 그 영업사원의 추가시공비 (예전에 저장한 결과나 영업사원·정산월이 여럿이면 null) */
  extraCost: SettlementExtraCostDeduction | null;
  rates: AppliedRates | null;
  /** RD가 보는 정산 화면: 저장·RD게시 버튼을 숨긴다 */
  readOnly?: boolean;
  /** RD 화면: 서버에서 계산한 정산금액 (비율은 RD 브라우저로 보내지 않는다) */
  fixedSummary?: SettlementSummaryValues | null;
  /** RD 화면: 정산금액 계산에 쓴 근로자 비율 (설명 한 줄로만 보여준다) */
  rdRates?: WorkerRates | null;
}) {
  // 권한 테이블의 비율 (화면에서 비율을 저장하면 저장한 값으로 바뀐다)
  const [savedRates, setSavedRates] = useState<AppliedRates | null>(null);
  const tableRates = savedRates ?? rates;
  const baseRates = tableRates ?? DEFAULT_WORKER_RATES;
  // 입력 중인 근로자 비율 (글자 그대로). 저장 전에도 화면의 정산금액은 바로 다시 계산한다
  const [rateInputs, setRateInputs] = useState<Record<RateKey, string> | null>(null);
  const overridden = !readOnly && rateInputs !== null;
  const appliedRates: WorkerRates = overridden
    ? {
        upTo5m: parseRate(rateInputs.upTo5m) ?? baseRates.upTo5m,
        upTo10m: parseRate(rateInputs.upTo10m) ?? baseRates.upTo10m,
        over10m: parseRate(rateInputs.over10m) ?? baseRates.over10m,
      }
    : baseRates;
  const rateChanged = RATE_KEYS.some((k) => appliedRates[k] !== baseRates[k]);
  const rateInvalid = !!rateInputs && RATE_KEYS.some((k) => parseRate(rateInputs[k]) === null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateMessage, setRateMessage] = useState<string | null>(null);
  const [ratePending, startRateTransition] = useTransition();
  const { profit, target, settlement, carryOver } = fixedSummary ?? summarizeSettlement(lines, carryIn?.금액 ?? 0, appliedRates, extraCost);
  const [showExtra, setShowExtra] = useState(false);
  const pct = (n: number) => `${n}%`;
  const [saved, setSaved] = useState<SavedSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [publishOpen, setPublishOpen] = useState(false);
  const salesNames = [...new Set(lines.map((l) => l.영업사원?.trim() || "(없음)"))];
  const months = [...new Set(lines.map((l) => l.정산월?.trim() || "(없음)"))];
  const single = salesNames.length === 1 && months.length === 1 && !salesNames.includes("(없음)") && !months.includes("(없음)");
  // 이 영업사원·정산월에 이미 게시한 것이 있으면 기간 변경·취소를 할 수 있게 RD게시 버튼을 켠다
  const [published, setPublished] = useState<RdPublish | null>(null);
  const salesName = single ? salesNames[0] : null;
  const monthName = single ? months[0] : null;
  useEffect(() => {
    if (readOnly || !salesName || !monthName) return;
    let cancelled = false;
    getRdPublishAction(salesName, monthName).then((res) => {
      if (!cancelled && res.ok) setPublished(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [readOnly, salesName, monthName]);
  // RD게시는 정산결과를 저장한 뒤에 할 수 있다 (이미 게시한 것은 변경·취소용으로 열 수 있다)
  // 비율을 바꾸고 저장하지 않았으면 정산결과 저장·RD게시를 막는다 (권한 테이블 비율로 계산하므로)
  const canOpenPublish = single && !rateChanged && (!!saved || !!published);

  function saveRates() {
    if (!salesName) return;
    setRateError(null);
    setRateMessage(null);
    if (rateInvalid) return setRateError("구간별 비율은 0~100 사이 숫자로 입력하세요");
    const nextRates = appliedRates;
    startRateTransition(async () => {
      const res = await saveWorkerRatesAction(lines.map((l) => l.영업사원ID?.trim()).find(Boolean) ?? null, salesName, nextRates);
      if (!res.ok) return setRateError(res.error);
      setSavedRates(res.data);
      setRateInputs(null);
      setSaved(null); // 저장한 정산결과는 예전 비율로 계산한 것이므로 다시 저장해야 RD게시할 수 있다
      setRateMessage(`${salesName}님의 구간별 비율을 권한 테이블에 저장했습니다. 정산결과를 다시 저장하세요.`);
    });
  }

  const items: { label: React.ReactNode; key: string; value: number; extra?: boolean }[] = [
    { key: "profit", label: "이익금액 합계", value: profit },
    { key: "deduction", label: "공제금", value: -DEDUCTION },
    // 추가시공비가 없어도(0원) 항상 보여준다
    {
      key: "extra",
      label: (
        <>
          {extraCost ? extraCostLabel(extraCost) : "추가시공비"}{" "}
          <span className="text-xs text-zinc-500">
            {extraCost ? `${extraCost.내역.length}건 · 부가세제외` : single ? "예전 결과" : "영업사원·정산월 하나씩 선택 시 계산"}
          </span>
        </>
      ),
      value: -extraCostDeduction(extraCost),
      extra: true,
    },
    ...(carryIn ? [{ key: "carryIn", label: "전달 누적이월금", value: -carryIn.금액 }] : []),
    { key: "target", label: "정산대상금액", value: target },
  ];

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveSettlementAction(ids);
      if (res.ok) setSaved(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 text-xs text-zinc-600">
          <p>
            영업사원 <b className="text-zinc-900">{salesNames.join(", ")}</b> · 정산월{" "}
            <b className="text-zinc-900">{months.join(", ")}</b>
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending || !single || rateChanged}
                title={
                  !single
                    ? "영업사원과 정산월이 하나씩인 현장만 골라야 저장할 수 있습니다"
                    : rateChanged
                      ? "바꾼 비율을 먼저 저장하세요 (아래 비율 저장)"
                      : undefined
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {pending ? "저장 중…" : "정산결과 저장"}
              </button>
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                disabled={!canOpenPublish}
                title={
                  !single
                    ? "영업사원과 정산월이 하나씩인 현장만 골라야 게시할 수 있습니다"
                    : rateChanged
                      ? "바꾼 비율을 먼저 저장하세요 (아래 비율 저장)"
                      : canOpenPublish
                      ? "이 정산결과를 영업사원(RD)에게 보여줄 기간을 정합니다"
                      : "정산결과 저장을 먼저 눌러야 게시할 수 있습니다"
                }
                className="rounded-md border border-blue-600 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
              >
                RD게시
              </button>
            </div>
          )}
          {!readOnly && published && (
            <p className="text-blue-700">
              RD게시 {publishStatus(published)} · {published.시작일} ~ {published.종료일}
            </p>
          )}
          {publishOpen && salesName && monthName && (
            <RdPublishDialog
              영업사원={salesName}
              정산월={monthName}
              ids={ids}
              canPublish={!!saved}
              current={published}
              onChange={setPublished}
              onClose={() => setPublishOpen(false)}
            />
          )}
          {!readOnly && !single && (
            <p className="text-amber-700">영업사원과 정산월을 하나씩 골라 정산해야 누적이월금이 반영되고 저장할 수 있습니다.</p>
          )}
          {carryIn && (
            <p>
              전달 누적이월금{" "}
              {carryIn.리셋
                ? "0원"
                : carryIn.이전정산월
                  ? `${formatMoney(carryIn.금액)}원 (${carryIn.이전정산월} 정산정보)`
                  : "0원 (전달 정산정보 없음)"}
            </p>
          )}
          {error && <p role="alert" className="whitespace-pre-line text-red-700">{error}</p>}
          {saved && (
            <p role="status" className="text-emerald-700">
              {saved.영업사원} {saved.정산월} 정산정보를 {saved.updated ? "갱신" : "저장"}했습니다 ·{" "}
              {saved.정산금 > 0 ? `정산금 ${formatMoney(saved.정산금)}원` : "정산금 없음"} · 누적이월금 {formatMoney(saved.누적이월금)}원
            </p>
          )}
        </div>
        <dl className="w-full max-w-sm space-y-1">
          {items.map((item) => (
            <div key={item.key} className="flex justify-between gap-6">
              <dt className="text-zinc-600">{item.label}</dt>
              <dd className="flex items-center tabular-nums text-zinc-900">
                {formatMoney(item.value)}
                {item.extra && extraCost && (
                  <span className="ml-2">
                    <ToggleButton open={showExtra} onClick={() => setShowExtra((v) => !v)} />
                  </span>
                )}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-6 border-t border-zinc-200 pt-1 font-semibold">
            <dt className="text-zinc-900">{target < 0 ? "이월금액" : "정산금액"}</dt>
            <dd className={`tabular-nums ${target < 0 ? "text-amber-700" : "text-blue-700"}`}>
              {formatMoney(target < 0 ? carryOver : settlement)}
            </dd>
          </div>
        </dl>
      </div>
      {showExtra && extraCost && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-zinc-600">
            {extraCostLabel(extraCost)} 내역 · 합계 {formatMoney(extraCost.합계)}원(부가세포함) → 부가세제외{" "}
            {formatMoney(extraCostDeduction(extraCost))}원 공제
          </p>
          <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
            {extraCost.내역.length > 0 ? (
              <ExtraCostTable rows={extraCost.내역} total={extraCost.합계} />
            ) : (
              <p className="p-4 text-center text-sm text-zinc-500">
                {Number(extraCost.기준월.slice(5, 7))}월에 시공시작한 추가시공비 내역이 없습니다.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="mt-3 border-t border-zinc-200 pt-2 text-xs leading-relaxed text-zinc-600">
        <p>이익금액 = 계약금(부가세제외) - 총출금액 합계</p>
        <p>추가시공비 = 정산월 전달에 시공시작한 해당 영업사원의 모든 한샘추가시공비 합계 (부가세제외 금액으로 공제)</p>
        <p>정산대상금액 = 이익금액 합계 - 공제금({formatMoney(DEDUCTION)}원) - 추가시공비 - 전달 누적이월금</p>
        <p>정산대상금액이 -이면 그 금액만큼 이월금액(= 이번 달 누적이월금), +이면 {readOnly ? "구간별 비율로 계산한 " : "아래 공식으로 계산한 "}정산금액(근로자 몫)을 표시하고 누적이월금은 0이 됩니다.</p>
        {/* 정산금액을 어떤 비율로 계산했는지 (RD 화면은 이 설명만, 비율 수정·공식·예시는 관리자 화면에만) */}
        {(() => {
          const used = readOnly ? rdRates : appliedRates;
          if (!used) return null;
          return (
            <p className={readOnly ? undefined : "font-medium text-zinc-700"}>
              정산금액은 정산대상금액을 구간별 비율로 누진 계산한 금액입니다: 500만원 이하 {pct(used.upTo5m)} · 500만원 초과
              1,000만원 이하 {pct(used.upTo10m)} · 1,000만원 초과 {pct(used.over10m)}
              {!readOnly && (rateChanged ? " (바꾼 비율, 아직 저장 안 됨)" : tableRates ? ` (${salesNames[0]}님 권한 테이블 비율)` : " (기본 비율)")}
            </p>
          );
        })()}
        {(readOnly ? rdRates : appliedRates) && (
          <ShareBreakdown target={target} settlement={settlement} carryOver={carryOver} rates={(readOnly ? rdRates : appliedRates)!} />
        )}
        {!readOnly && (
          <>
            <p className="mt-1 font-semibold text-zinc-700">
              정산대상금액 기준 정산 공식{" "}
              <span className="font-normal text-zinc-500">
                {tableRates
                  ? tableRates.usedDefault
                    ? "(권한에 비율이 없는 구간은 기본 비율 적용, 저장하면 권한 테이블에 반영)"
                    : "(영업사원 개인 비율, 권한 테이블 기준)"
                  : "(영업사원을 하나 골라야 개인 비율이 적용됩니다. 아래는 기본 비율)"}
              </span>
            </p>
            <div className="mt-1 space-y-1.5">
                <ol className="list-decimal space-y-1 pl-4">
                  {RATE_KEYS.map((k) => {
                    const text = rateInputs?.[k] ?? String(baseRates[k]);
                    const invalid = parseRate(text) === null;
                    return (
                      <li key={k}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {RATE_LABEL[k]}: 사업주 {pct(100 - appliedRates[k])} : 근로자
                          <input
                            value={text}
                            onChange={(e) => {
                              setRateMessage(null);
                              setRateInputs({ ...(rateInputs ?? rateTexts(baseRates)), [k]: e.target.value });
                            }}
                            readOnly={!single}
                            title={single ? undefined : "영업사원을 하나 골라야 비율을 바꿀 수 있습니다"}
                            inputMode="decimal"
                            aria-label={`${RATE_LABEL[k]} 근로자 비율(%)`}
                            className={`w-14 rounded border px-1.5 py-0.5 text-right tabular-nums outline-none focus:border-blue-500 ${
                              invalid ? "border-red-400 text-red-700" : appliedRates[k] !== baseRates[k] ? "border-blue-500 bg-blue-50 text-blue-800" : "border-zinc-300"
                            }`}
                          />
                          %
                          {appliedRates[k] !== baseRates[k] && <span className="text-zinc-400">(원래 {pct(baseRates[k])})</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {(rateChanged || rateInvalid) && (
                  <p className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                    바꾼 비율로 미리 계산한 결과입니다. 비율 저장을 누르면 {salesName}님의 권한 테이블 비율이 바뀌고, 정산결과 저장·RD게시·RD 화면 모두 이 비율로 계산합니다.
                    <button
                      type="button"
                      onClick={saveRates}
                      disabled={ratePending || rateInvalid}
                      className="rounded bg-blue-600 px-2 py-0.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {ratePending ? "저장 중…" : "비율 저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRateInputs(null);
                        setRateError(null);
                      }}
                      disabled={ratePending}
                      className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
                    >
                      원래 비율로
                    </button>
                  </p>
                )}
                {rateError && <p role="alert" className="text-red-700">{rateError}</p>}
                {rateMessage && <p role="status" className="text-emerald-700">{rateMessage}</p>}
            </div>
            <p className="mt-1">
              위 구간별 비율은 누진 적용한다. (예시: 월 이익 800만원인 경우 → 500만원×{pct(appliedRates.upTo5m)} + 300만원×
              {pct(appliedRates.upTo10m)} = 근로자 {formatMoney(workerShare(8_000_000, appliedRates))}원)
            </p>
          </>
        )}
      </div>
      {/* 게시한 정산이면 RD가 남긴 의견과 응답을 함께 보여준다 */}
      {!readOnly && published && salesName && monthName && (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <OpinionThread 영업사원={salesName} 정산월={monthName} role="admin" />
        </div>
      )}
    </div>
  );
}

/** 현장별 계약금·총입금액·총출금액 표. netOfVat이면 정산결과(부가세 제외) 기준으로 보여준다 */
function SettlementTable({
  lines,
  netOfVat = false,
  onDetail,
}: {
  lines: SettlementLine[];
  netOfVat?: boolean;
  onDetail: (line: SettlementLine, group: DetailGroup) => void;
}) {
  const partsOf = netOfVat ? netOutflowParts : outflowParts;
  const contractOf = (l: SettlementLine) => (netOfVat && l.계약금 !== null ? withoutVat(l.계약금) : l.계약금);
  // 정산결과의 합계는 표에 보이는 금액의 합이다
  const outflowTotal = (l: SettlementLine) => (netOfVat ? Object.values(partsOf(l)).reduce((a, b) => a + b, 0) : l.총출금액);
  const total = (pick: (l: SettlementLine) => number | null) => lines.reduce((acc, l) => acc + (pick(l) ?? 0), 0);
  // 한샘·홈씨씨·시공비 외 출금이 있을 때만 기타 컬럼을 보여 합계가 총출금액과 맞게 한다
  const showOther = lines.some((l) => hasOutflowDetail(l, "기타"));
  const tax = netOfVat ? "부가세제외" : "부가세포함";
  const columns: { group: OutflowGroup; label: React.ReactNode }[] = [
    { group: "한샘", label: `한샘(${tax})` },
    { group: "홈씨씨", label: `홈씨씨(${tax})` },
    { group: "시공비포함", label: <>시공비(한샘외)<br />{tax}</> },
    { group: "시공비미포함", label: <>시공비(한샘외)<br />부가세미포함</> },
    ...(showOther ? [{ group: "기타" as const, label: "기타" }] : []),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-100 text-xs text-zinc-600">
          <tr>
            <th rowSpan={2} className={`${TH} text-left`}>현장</th>
            <th rowSpan={2} className={`${TH} text-right`}>{netOfVat ? "계약금(부가세제외)" : "계약금"}</th>
            {!netOfVat && <th rowSpan={2} className={`${TH} text-right`}>총입금액</th>}
            <th colSpan={columns.length + 1} className={`${TH} border-l text-center`}>총출금액</th>
            {netOfVat && <th rowSpan={2} className={`${TH} border-l text-right`}>이익금액</th>}
          </tr>
          <tr>
            <th className={`${TH} border-l text-right`}>합계</th>
            {columns.map((c) => (
              <th key={c.group} className={`${TH} text-right`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className={TD}>
                <span className="block font-medium text-zinc-900">{l.고객명 || "(고객명 없음)"}</span>
                <span className="block text-xs text-zinc-500 tabular-nums">
                  {[l.현장번호, l.영업사원, l.정산월].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className={`${TD} ${NUM}`}><Money value={contractOf(l)} /></td>
              {!netOfVat && (
                <td className={`${TD} ${NUM} text-emerald-700`}>
                  {formatMoney(l.총입금액)}
                  <DetailButton onClick={() => onDetail(l, "입금")} />
                </td>
              )}
              <td className={`${TD} ${NUM} border-l border-l-zinc-200 text-red-600`}>{formatMoney(outflowTotal(l))}</td>
              {columns.map((c) => (
                <td key={c.group} className={`${TD} ${NUM}`}>
                  {formatMoney(partsOf(l)[c.group])}
                  {hasOutflowDetail(l, c.group) && <DetailButton onClick={() => onDetail(l, c.group)} />}
                </td>
              ))}
              {netOfVat && <td className={`${TD} ${NUM} border-l border-l-zinc-200`}><Money value={netProfit(l)} /></td>}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-zinc-100 font-semibold">
          <tr>
            <td className="px-3 py-2">합계</td>
            <td className={`px-3 py-2 ${NUM}`}>{formatMoney(total(contractOf))}</td>
            {!netOfVat && <td className={`px-3 py-2 ${NUM} text-emerald-700`}>{formatMoney(total((l) => l.총입금액))}</td>}
            <td className={`border-l border-l-zinc-200 px-3 py-2 ${NUM} text-red-600`}>{formatMoney(total(outflowTotal))}</td>
            {columns.map((c) => (
              <td key={c.group} className={`px-3 py-2 ${NUM}`}>{formatMoney(total((l) => partsOf(l)[c.group]))}</td>
            ))}
            {netOfVat && <td className={`border-l border-l-zinc-200 px-3 py-2 ${NUM}`}>{formatMoney(total(netProfit))}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** 정산대상(부가세포함)·정산결과(부가세제외) 표와 정산금액 요약. readOnly면 저장·RD게시 버튼 없이 보여주기만 한다 */
function SettlementResultSections({
  result,
  readOnly = false,
  fixedSummary = null,
  rdRates = null,
}: {
  result: SettlementWithCarryIn;
  readOnly?: boolean;
  fixedSummary?: SettlementSummaryValues | null;
  rdRates?: WorkerRates | null;
}) {
  const [detail, setDetail] = useState<{ line: SettlementLine; group: DetailGroup; netOfVat: boolean } | null>(null);
  const ids = result.lines.map((l) => l.id);
  return (
    <>
      <section aria-labelledby="settlement-result" className="space-y-2">
        <h2 id="settlement-result" className="text-base font-semibold text-zinc-900">
          정산대상 <span className="ml-1 text-sm font-normal text-zinc-500">{result.lines.length}개 현장</span>
        </h2>
        {!readOnly && result.warnings.length > 0 && (
          <p role="status" className="whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {result.warnings.join("\n")}
          </p>
        )}
        <SettlementTable lines={result.lines} onDetail={(line, group) => setDetail({ line, group, netOfVat: false })} />
      </section>
      <section aria-labelledby="settlement-net" className="space-y-2">
        <h2 id="settlement-net" className="text-base font-semibold text-zinc-900">
          정산결과 <span className="ml-1 text-sm font-normal text-zinc-500">{result.lines.length}개 현장</span>
        </h2>
        <SettlementTable lines={result.lines} netOfVat onDetail={(line, group) => setDetail({ line, group, netOfVat: true })} />
        {/* 현장 선택이 바뀌면 저장 여부·게시 상태를 새로 확인한다 */}
        <SettlementSummary
          key={ids.join(",")}
          lines={result.lines}
          ids={ids}
          carryIn={result.carryIn}
          extraCost={result.extraCost ?? null}
          rates={result.rates}
          readOnly={readOnly}
          fixedSummary={fixedSummary}
          rdRates={rdRates}
        />
      </section>
      {detail && (
        <DepositDetailDialog line={detail.line} group={detail.group} netOfVat={detail.netOfVat} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

/** RD가 보는 정산 화면: 관리자가 정산결과 저장 후 게시한 정산결과를 게시 기간 동안 그대로 보여준다 */
export function RdSettlementView({
  영업사원,
  정산월,
  시작일,
  종료일,
  result,
  summary,
  rates,
}: {
  /** 로그인한 RD (게시 대상) */
  영업사원: string;
  정산월: string;
  시작일: string;
  종료일: string;
  /** 게시한 정산결과 (구간별 비율은 빼고 넘긴다) */
  result: SettlementWithCarryIn;
  /** 서버에서 권한 테이블 비율로 계산한 정산금액 */
  summary: SettlementSummaryValues;
  /** 정산금액 계산에 쓴 근로자 비율 (설명용) */
  rates: WorkerRates | null;
}) {
  return (
    <div className="flex-1 space-y-4 overflow-auto p-4 sm:p-6 lg:min-h-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">정산</h1>
          <p className="mt-2 text-sm text-zinc-700">
            정산월 <b className="text-zinc-900">{정산월}</b>
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          게시 기간 {시작일} ~ {종료일}
        </p>
      </header>
      <SettlementResultSections result={result} readOnly fixedSummary={summary} rdRates={rates} />
      <OpinionThread 영업사원={영업사원} 정산월={정산월} role="rd" />
    </div>
  );
}

export function SettlementView({ sites }: { sites: SettlementCandidate[] }) {
  const [sales, setSales] = useState("");
  // 정산월 기본값은 전체(""). 정산결과 저장은 영업사원·정산월이 하나씩인 현장만 골랐을 때 가능하다
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [result, setResult] = useState<SettlementWithCarryIn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploadTable, setUploadTable] = useState<UploadTable | null>(null);
  const [publishListOpen, setPublishListOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // RD 의견 중 응답 대기 수 (RD게시 현황 버튼 배지)
  const [waitingOpinions, setWaitingOpinions] = useState(0);
  const refreshWaiting = useCallback(() => {
    countUnansweredOpinionsAction().then((res) => {
      if (res.ok) setWaitingOpinions(Object.values(res.data).reduce((a, b) => a + b, 0));
    });
  }, []);
  useEffect(() => {
    refreshWaiting();
  }, [refreshWaiting]);

  const salesOptions = useMemo(() => options(sites.map((s) => s.영업사원)).sort((a, b) => a.localeCompare(b, "ko")), [sites]);
  const monthOptions = useMemo(() => monthOptionsOf(sites), [sites]);
  const rows = useMemo(
    () => sites.filter((s) => (!sales || s.영업사원?.trim() === sales) && (!month || s.정산월?.trim() === month)),
    [sites, sales, month],
  );
  const allChecked = rows.length > 0 && rows.every((s) => selected.has(s.id));

  // 조건이 바뀌면 다른 조건에서 고른 현장이 섞이지 않게 선택과 결과를 비운다
  function changeFilter(apply: () => void) {
    apply();
    setSelected(new Set());
    setResult(null);
    setError(null);
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    setResult(null);
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((s) => s.id)));
    setResult(null);
  }

  function settle() {
    setError(null);
    startTransition(async () => {
      const res = await computeSettlementAction([...selected]);
      if (res.ok) setResult(res.data);
      else {
        setResult(null);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto p-4 sm:p-6 lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-zinc-900">
          정산 <span className="ml-1 text-sm font-normal text-zinc-500">미정산 현장 {rows.length}건</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            정산내역
          </button>
          <button
            type="button"
            onClick={() => setPublishListOpen(true)}
            className="rounded-md border border-blue-600 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            title={waitingOpinions > 0 ? `응답 대기 중인 RD 의견 ${waitingOpinions}건` : undefined}
          >
            RD게시 현황
            {waitingOpinions > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">의견 {waitingOpinions}</span>
            )}
          </button>
          {UPLOAD_TABLE_KEYS.map((table) => (
            <button
              key={table}
              type="button"
              onClick={() => setUploadTable(table)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              {UPLOAD_TABLES[table].label}
            </button>
          ))}
        </div>
      </header>

      {publishListOpen && (
        <RdPublishListDialog
          onClose={() => {
            setPublishListOpen(false);
            refreshWaiting();
          }}
        />
      )}
      {historyOpen && <SettlementHistoryDialog onClose={() => setHistoryOpen(false)} />}

      {uploadTable && (
        <SettlementUploadDialog
          key={uploadTable}
          table={uploadTable}
          onClose={() => setUploadTable(null)}
          onChanged={() => setResult(null)}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="w-full sm:w-auto">
          <span className="mb-1 block text-xs font-medium text-zinc-700">영업사원</span>
          <select value={sales} onChange={(e) => changeFilter(() => setSales(e.target.value))} className={SELECT}>
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
          <select value={month} onChange={(e) => changeFilter(() => setMonth(e.target.value))} className={SELECT}>
            <option value="">전체</option>
            {monthOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={settle}
          disabled={pending || selected.size === 0}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? "계산 중…" : `정산 (${selected.size})`}
        </button>
      </div>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-xs text-zinc-600">
            <tr>
              <th className={`${TH} w-10 text-center`}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                  aria-label="전체 선택"
                  className="accent-blue-600"
                />
              </th>
              <th className={`${TH} text-left`}>현장번호</th>
              <th className={`${TH} text-left`}>고객명</th>
              <th className={`${TH} text-left`}>영업사원</th>
              <th className={`${TH} text-left`}>정산월</th>
              <th className={`${TH} text-right`}>계약금</th>
              <th className={`${TH} text-right`}>한샘상품가액</th>
              <th className={`${TH} text-right`}>홈씨씨상품가액</th>
              <th className={`${TH} text-right`}>시공비</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={selected.has(s.id) ? "bg-blue-50" : "hover:bg-zinc-50"}>
                <td className={`${TD} text-center`}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    aria-label={`${s.현장번호 ?? ""} ${s.고객명 ?? ""} 선택`}
                    className="accent-blue-600"
                  />
                </td>
                <td className={`${TD} tabular-nums`}>{s.현장번호}</td>
                <td className={TD}>{s.고객명}</td>
                <td className={TD}>{s.영업사원}</td>
                <td className={TD}>{s.정산월}</td>
                <td className={`${TD} ${NUM}`}><Money value={s.계약가} /></td>
                <td className={`${TD} ${NUM}`}><Money value={s.한샘상품가액} /></td>
                <td className={`${TD} ${NUM}`}><Money value={s.홈씨씨상품가액} /></td>
                <td className={`${TD} ${NUM}`}><Money value={s.시공비} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">조건에 맞는 미정산 현장이 없습니다.</p>}
      </section>

      {error && (
        <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && <SettlementResultSections result={result} />}
    </div>
  );
}

/** 오늘 한국 날짜 (YYYY-MM-DD) */
function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** YYYY-MM-DD에 days일을 더한다 */
function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DATE_INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** 게시 상태 (오늘 한국 날짜 기준) */
function publishStatus(p: Pick<RdPublish, "시작일" | "종료일">, today = todayKst()) {
  return today < p.시작일 ? "게시 예정" : today > p.종료일 ? "게시 종료" : "게시 중";
}

function StatusBadge({ publish }: { publish: Pick<RdPublish, "시작일" | "종료일"> }) {
  const status = publishStatus(publish);
  const tone =
    status === "게시 중" ? "bg-blue-50 text-blue-700" : status === "게시 예정" ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-500";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${tone}`}>{status}</span>;
}

function PeriodInputs({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label>
        <span className="mb-1 block text-xs font-medium text-zinc-700">시작일</span>
        <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} className={DATE_INPUT} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-zinc-700">종료일</span>
        <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} className={DATE_INPUT} />
      </label>
    </div>
  );
}

function periodError(from: string, to: string) {
  if (!from || !to) return "시작일과 종료일을 선택하세요";
  if (from > to) return "종료일은 시작일과 같거나 뒤여야 합니다";
  return null;
}

function DialogFrame({ title, subtitle, wide = false, full = false, onClose, children }: {
  title: string;
  subtitle: string;
  wide?: boolean;
  /** 표를 크게 보여주는 창 */
  full?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // 정산내역 창 안에서 연 팝업은 그 팝업만 닫는다
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90dvh] w-full flex-col rounded-xl bg-white text-sm shadow-xl ${full ? "max-w-7xl" : wide ? "max-w-3xl" : "max-w-sm"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-100">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * RD게시: 저장한 정산결과를 영업사원(RD)에게 보여줄 기간 (시작일~종료일, 둘 다 포함).
 * canPublish(정산결과 저장 후)면 지금 정산결과를 게시하고, 아니면 이미 게시한 것의 기간 변경·취소만 한다.
 */
function RdPublishDialog({
  영업사원,
  정산월,
  ids,
  canPublish,
  current,
  onChange,
  onClose,
}: {
  영업사원: string;
  정산월: string;
  ids: number[];
  canPublish: boolean;
  current: RdPublish | null;
  onChange: (p: RdPublish | null) => void;
  onClose: () => void;
}) {
  const today = todayKst();
  const [from, setFrom] = useState(current?.시작일 ?? today);
  const [to, setTo] = useState(current?.종료일 ?? addDays(today, 6));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true; data: RdPublish | null } | { ok: false; error: string }>, done: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      onChange(res.data);
      setMessage(done);
    });
  }

  function submit() {
    const invalid = periodError(from, to);
    if (invalid) return setError(invalid);
    if (canPublish) run(() => publishRdAction(ids, from, to), `${영업사원}님에게 ${정산월} 정산결과를 ${from} ~ ${to} 동안 보여줍니다`);
    else if (current) run(() => updateRdPublishPeriodAction(current.id, from, to), `게시 기간을 ${from} ~ ${to}로 변경했습니다`);
  }

  function cancel() {
    if (!current || !window.confirm(`${영업사원}님의 ${정산월} 정산 게시를 취소할까요?`)) return;
    run(() => cancelRdPublishAction(current.id), "게시를 취소했습니다");
  }

  return (
    <DialogFrame title="RD게시" subtitle="게시 기간 동안에만 이 영업사원에게 정산 메뉴와 아래 정산결과가 보입니다." onClose={onClose}>
      <div className="space-y-3 overflow-y-auto px-5 py-4">
        <dl className="space-y-1">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">영업사원</dt>
            <dd className="font-semibold text-zinc-900">{영업사원}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">정산월</dt>
            <dd className="font-semibold text-zinc-900">{정산월}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-600">현재 상태</dt>
            <dd className="flex items-center gap-1.5 text-zinc-700 tabular-nums">
              {current ? (
                <>
                  <StatusBadge publish={current} /> {current.시작일} ~ {current.종료일}
                </>
              ) : (
                "게시 안 함"
              )}
            </dd>
          </div>
        </dl>
        <PeriodInputs from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {!canPublish && current && (
          <p className="text-xs text-zinc-500">게시된 정산결과는 그대로 두고 기간만 바꿉니다. 결과를 새로 게시하려면 정산결과 저장 후 게시하세요.</p>
        )}
        {canPublish && current && <p className="text-xs text-zinc-500">다시 게시하면 RD 화면의 정산결과도 지금 결과로 바뀝니다.</p>}
        {error && (
          <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
            {message}
          </p>
        )}
      </div>
      <div className="flex justify-between gap-2 border-t border-zinc-200 px-5 py-3">
        <div>
          {current && (
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-md px-3 py-2 font-medium text-red-600 hover:bg-red-50 disabled:text-zinc-400"
            >
              게시 취소
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || (!canPublish && !current)}
          className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? "저장 중…" : canPublish ? (current ? "다시 게시" : "게시") : "기간 변경"}
        </button>
      </div>
    </DialogFrame>
  );
}

/** RD게시 현황: 모든 게시의 기간 변경·취소 */
function RdPublishListDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<RdPublish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 영업사원·정산월별 응답 대기 의견 수
  const [waiting, setWaiting] = useState<Record<string, number>>({});

  useEffect(() => {
    countUnansweredOpinionsAction().then((res) => {
      if (res.ok) setWaiting(res.data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRdPublishAction().then((res) => {
      if (cancelled) return;
      if (res.ok) setRows(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DialogFrame title="RD게시 현황" subtitle="게시 기간을 바꾸거나 게시를 취소하고, RD가 남긴 정산 의견에 응답할 수 있습니다. 새로 게시는 정산결과 저장 후 RD게시로 합니다." full onClose={onClose}>
      <div className="overflow-auto">
        {error ? (
          <p role="alert" className="m-4 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        ) : rows === null ? (
          <p className="p-8 text-center text-zinc-500">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">게시한 정산결과가 없습니다.</p>
        ) : (
          <table className="min-w-full">
            <thead className="bg-zinc-100 text-xs text-zinc-600">
              <tr>
                <th className={`${TH} text-left`}>영업사원</th>
                <th className={`${TH} text-left`}>정산월</th>
                <th className={`${TH} text-left`}>상태</th>
                <th className={`${TH} text-left`}>시작일</th>
                <th className={`${TH} text-left`}>종료일</th>
                <th className={`${TH} text-left`}>게시자</th>
                <th className={`${TH} text-left`}>의견</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RdPublishRow
                  key={r.id}
                  row={r}
                  waiting={waiting[opinionKey(r.영업사원, r.정산월)] ?? 0}
                  onWaitingChange={(n) => setWaiting((prev) => ({ ...prev, [opinionKey(r.영업사원, r.정산월)]: n }))}
                  onChange={(next) => setRows((prev) => (prev ?? []).map((p) => (p.id === r.id ? next : p)))}
                  onRemove={() => setRows((prev) => (prev ?? []).filter((p) => p.id !== r.id))}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DialogFrame>
  );
}

function RdPublishRow({
  row,
  waiting,
  onWaitingChange,
  onChange,
  onRemove,
}: {
  row: RdPublish;
  /** 응답 대기 중인 RD 의견 수 */
  waiting: number;
  onWaitingChange: (n: number) => void;
  onChange: (p: RdPublish) => void;
  onRemove: () => void;
}) {
  const [showOpinions, setShowOpinions] = useState(false);
  const [from, setFrom] = useState(row.시작일);
  const [to, setTo] = useState(row.종료일);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = from !== row.시작일 || to !== row.종료일;
  const INPUT = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-blue-500";

  function save() {
    const invalid = periodError(from, to);
    if (invalid) return setError(invalid);
    setError(null);
    startTransition(async () => {
      const res = await updateRdPublishPeriodAction(row.id, from, to);
      if (res.ok) onChange(res.data);
      else setError(res.error);
    });
  }

  function cancel() {
    if (!window.confirm(`${row.영업사원}님의 ${row.정산월} 정산 게시를 취소할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelRdPublishAction(row.id);
      if (res.ok) onRemove();
      else setError(res.error);
    });
  }

  return (
    <>
      <tr className="text-zinc-700">
        <td className={`${TD} font-medium text-zinc-900`}>{row.영업사원}</td>
        <td className={TD}>{row.정산월}</td>
        <td className={TD}>
          <StatusBadge publish={row} />
        </td>
        <td className={TD}>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={INPUT} aria-label="시작일" />
        </td>
        <td className={TD}>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={INPUT} aria-label="종료일" />
        </td>
        <td className={TD}>{row.게시자}</td>
        <td className={TD}>
          <button
            type="button"
            onClick={() => setShowOpinions((v) => !v)}
            aria-expanded={showOpinions}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              waiting > 0 ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {showOpinions ? "의견 닫기" : waiting > 0 ? `응답 대기 ${waiting}` : "의견 보기"}
          </button>
        </td>
        <td className={`${TD} text-right`}>
          <button
            type="button"
            onClick={save}
            disabled={pending || !changed}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            기간 변경
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="ml-1 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:text-zinc-400"
          >
            게시 취소
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={8} className="px-3 pb-2 text-xs text-red-700">
            {error}
          </td>
        </tr>
      )}
      {showOpinions && (
        <tr>
          <td colSpan={8} className="bg-zinc-50 p-3">
            <OpinionThread 영업사원={row.영업사원} 정산월={row.정산월} role="admin" onUnansweredChange={onWaitingChange} />
          </td>
        </tr>
      )}
    </>
  );
}

/** "2026-11" → "2026년 11월" (그 외 형식은 그대로) */
function yearMonthLabel(v: string | null) {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}월` : (v ?? "");
}

/** 정산내역: 지금까지 저장한 정산을 RD별로 고르고, 한 건을 누르면 저장 당시의 정산결과를 그대로 보여준다 */
function SettlementHistoryDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<SettlementHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState("");
  const [month, setMonth] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ id: number; result: SettlementWithCarryIn | null } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, startDetail] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listSettlementHistoryAction().then((res) => {
      if (cancelled) return;
      if (res.ok) setRows(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const salesOptions = useMemo(
    () => options((rows ?? []).map((r) => r.영업사원)).sort((a, b) => a.localeCompare(b, "ko")),
    [rows],
  );
  const monthOptions = useMemo(() => options((rows ?? []).map((r) => r.정산월)).sort((a, b) => b.localeCompare(a)), [rows]);
  const visible = useMemo(
    () => (rows ?? []).filter((r) => (!sales || r.영업사원?.trim() === sales) && (!month || r.정산월?.trim() === month)),
    [rows, sales, month],
  );
  const sum = (key: "총이익금" | "정산금") => visible.reduce((acc, r) => acc + (toMoney(r[key]) ?? 0), 0);

  function open(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetailError(null);
    if (detail?.id === id) return;
    startDetail(async () => {
      const res = await getSettlementHistoryDetailAction(id);
      if (res.ok) setDetail({ id, result: res.data });
      else setDetailError(res.error);
    });
  }

  const opened = visible.find((r) => r.id === openId) ?? null;

  return (
    <DialogFrame
      title="정산내역"
      subtitle="지금까지 저장한 정산을 RD별로 봅니다. 행을 누르면 정산결과를 저장할 때의 현장별 내역과 정산금액 계산을 볼 수 있습니다."
      full
      onClose={onClose}
    >
      <div className="space-y-4 overflow-auto px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium text-zinc-700">RD</span>
            <select
              value={sales}
              onChange={(e) => {
                setSales(e.target.value);
                setOpenId(null);
              }}
              className={SELECT}
            >
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
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setOpenId(null);
              }}
              className={SELECT}
            >
              <option value="">전체</option>
              {monthOptions.map((v) => (
                <option key={v} value={v}>
                  {yearMonthLabel(v)}
                </option>
              ))}
            </select>
          </label>
          {rows && <p className="pb-1.5 text-xs text-zinc-500">{visible.length}건</p>}
        </div>

        {error ? (
          <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-red-700">
            {error}
          </p>
        ) : rows === null ? (
          <p className="p-8 text-center text-zinc-500">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">저장한 정산이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="min-w-full">
              <thead className="bg-zinc-100 text-xs text-zinc-600">
                <tr>
                  <th className={`${TH} text-left`}>정산월</th>
                  <th className={`${TH} text-left`}>RD</th>
                  <th className={`${TH} text-right`}>현장</th>
                  <th className={`${TH} text-right`}>총이익금</th>
                  <th className={`${TH} text-right`}>정산금</th>
                  <th className={`${TH} text-right`}>누적이월금</th>
                  <th className={`${TH} text-left`}>저장일시</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => open(r.id)}
                    className={`cursor-pointer ${openId === r.id ? "bg-blue-50" : "hover:bg-zinc-50"}`}
                  >
                    <td className={`${TD} font-medium text-zinc-900`}>{yearMonthLabel(r.정산월)}</td>
                    <td className={TD}>{r.영업사원}</td>
                    <td className={`${TD} ${NUM}`}>
                      {r.현장수 === null ? <span className="text-zinc-300">-</span> : `${r.현장수}곳`}
                    </td>
                    <td className={`${TD} ${NUM}`}>{r.총이익금}</td>
                    <td className={`${TD} ${NUM} font-semibold text-blue-700`}>{r.정산금}</td>
                    <td className={`${TD} ${NUM} text-amber-700`}>{r.누적이월금}</td>
                    <td className={`${TD} text-xs text-zinc-500`}>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                    <td className={`${TD} text-right`}>
                      <span className="text-xs font-medium text-blue-600">{openId === r.id ? "닫기" : "상세"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-100 font-semibold">
                <tr>
                  <td colSpan={3} className="px-3 py-2">
                    합계
                  </td>
                  <td className={`px-3 py-2 ${NUM}`}>{formatMoney(sum("총이익금"))}</td>
                  <td className={`px-3 py-2 ${NUM} text-blue-700`}>{formatMoney(sum("정산금"))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {opened && (
          <section className="space-y-4 rounded-lg border border-blue-200 bg-zinc-50 p-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              {opened.영업사원} · {yearMonthLabel(opened.정산월)} 정산 상세
            </h3>
            {detailError ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                {detailError}
              </p>
            ) : loadingDetail || detail?.id !== opened.id ? (
              <p className="p-4 text-center text-zinc-500">불러오는 중…</p>
            ) : detail.result ? (
              <SettlementResultSections result={detail.result} readOnly rdRates={detail.result.rates} />
            ) : (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                이 정산은 상세 내역을 함께 저장하기 전에 저장한 것이라 합계만 있습니다. 현장별 내역을 보려면 그 현장들을 다시
                정산해 정산결과를 저장하세요.
              </p>
            )}
          </section>
        )}
      </div>
    </DialogFrame>
  );
}

function DetailButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-2 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
    >
      상세
    </button>
  );
}

function hasOutflowDetail(line: SettlementLine, group: OutflowGroup) {
  return group === "한샘"
    ? line.한샘.주문.length > 0 || (line.한샘.추가시공비 ?? 0) !== 0
    : outflowRows(line, group).length > 0;
}

/** 현장 하나의 입금 내역(입금구분별) 또는 총출금액 한 묶음의 내역 */
function DepositDetailDialog({
  line,
  group,
  netOfVat,
  onClose,
}: {
  line: SettlementLine;
  group: DetailGroup;
  /** 정산결과 표에서 연 경우: 한샘 상세를 부가세 제외 기준으로 보여준다 */
  netOfVat: boolean;
  onClose: () => void;
}) {
  const rows = group === "입금" ? line.입금내역 : group === "한샘" ? [] : outflowRows(line, group);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // 정산내역 창 안에서 연 팝업은 그 팝업만 닫는다
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-detail-title"
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h3 id="settlement-detail-title" className="text-base font-semibold text-zinc-900">
              {group === "한샘" && netOfVat ? "한샘(부가세제외)" : GROUP_LABEL[group]} 내역
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
              {[line.고객명, line.현장번호].filter(Boolean).join(" · ")}
            </p>
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
        <div className="overflow-auto">
          {group === "한샘" ? (
            <>
              <p className="px-3 py-2 text-xs text-zinc-500 tabular-nums">
                공급가(HS) {formatMoney(line.한샘["공급가(HS)"])} · 공급가(S1) {formatMoney(line.한샘["공급가(S1)"])}
              </p>
              <HansemOrders hansem={line.한샘} netOfVat={netOfVat} />
            </>
          ) : rows.length > 0 ? (
            <CategoryTable rows={rows} total={rowsSum(rows)} />
          ) : (
            <p className="p-8 text-center text-sm text-zinc-500">내역이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 추가시공비는 정산월 전달 것이다 (11월 정산 → "추가시공비(10월)") */
function extraCostLabel(extraCost: SettlementExtraCostDeduction) {
  return `추가시공비(${Number(extraCost.기준월.slice(5, 7))}월)`;
}

const vatOf = (amount: number | null) => (amount === null ? null : withVat(amount));

/** 한샘주문진도정보의 확정 주문별 공급가 */
function HansemOrders({ hansem, netOfVat }: { hansem: SettlementLine["한샘"]; netOfVat: boolean }) {
  // 세로 합계가 표와 맞도록 주문별 부가세 포함 금액을 더한다
  // 예전에 저장한 정산결과는 현장별 추가시공비가 한샘 금액에 들어 있다
  const grossTotal = hansem["공급가(부가세포함)"] + (hansem.추가시공비 ?? 0);
  const vatTotal = (key: "공급가(HS)" | "공급가(S1)") => hansem.주문.reduce((acc, o) => acc + withVat(o[key] ?? 0), 0);
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-zinc-100 text-xs text-zinc-600">
        <tr>
          <th className={`${TH} text-left`}>주문번호</th>
          <th className={`${TH} text-left`}>주문등록일</th>
          <th className={`${TH} text-left`}>공정</th>
          <th className={`${TH} text-left`}>품목명</th>
          <th className={`${TH} text-right`}>공급가</th>
          {!netOfVat && <th className={`${TH} text-right`}>공급가(부가세포함)</th>}
          <th className={`${TH} text-right`}>공급가(HS)</th>
          {!netOfVat && <th className={`${TH} text-right`}>공급가(HS)(부가세포함)</th>}
          <th className={`${TH} text-right`}>공급가(S1)</th>
          {!netOfVat && <th className={`${TH} text-right`}>공급가(S1)(부가세포함)</th>}
        </tr>
      </thead>
      <tbody>
        {hansem.주문.map((o, i) => (
          <tr key={`${o.주문번호 ?? "none"}-${i}`} className="text-zinc-700">
            <td className={`${TD} tabular-nums`}>{o.주문번호}</td>
            <td className={`${TD} tabular-nums`}>{o.주문등록일}</td>
            <td className={TD}>{o.공정}</td>
            <td className={TD}>{o.품목명}</td>
            <td className={`${TD} ${NUM}`}><Money value={o.공급가} /></td>
            {!netOfVat && <td className={`${TD} ${NUM}`}><Money value={vatOf(o.공급가)} /></td>}
            <td className={`${TD} ${NUM}`}><Money value={o["공급가(HS)"]} /></td>
            {!netOfVat && <td className={`${TD} ${NUM}`}><Money value={vatOf(o["공급가(HS)"])} /></td>}
            <td className={`${TD} ${NUM}`}><Money value={o["공급가(S1)"]} /></td>
            {!netOfVat && <td className={`${TD} ${NUM}`}><Money value={vatOf(o["공급가(S1)"])} /></td>}
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-zinc-100 font-semibold">
        <tr className="font-medium">
          <td colSpan={4} className="px-3 py-2">공급가 소계</td>
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(hansem.공급가)}</td>
          {!netOfVat && <td className={`px-3 py-2 ${NUM}`}>{formatMoney(hansem["공급가(부가세포함)"])}</td>}
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(hansem["공급가(HS)"])}</td>
          {!netOfVat && <td className={`px-3 py-2 ${NUM}`}>{formatMoney(vatTotal("공급가(HS)"))}</td>}
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(hansem["공급가(S1)"])}</td>
          {!netOfVat && <td className={`px-3 py-2 ${NUM}`}>{formatMoney(vatTotal("공급가(S1)"))}</td>}
        </tr>
        <tr className="font-medium">
          <td colSpan={netOfVat ? 4 : 5} className="px-3 py-2">AS 및 기타비용</td>
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(0)}</td>
          <td colSpan={netOfVat ? 2 : 4} />
        </tr>
        <tr>
          <td colSpan={netOfVat ? 4 : 5} className="px-3 py-2">{netOfVat ? "한샘(부가세제외) 합계" : "한샘(부가세포함) 합계"}</td>
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(netOfVat ? withoutVat(grossTotal) : grossTotal)}</td>
          <td colSpan={netOfVat ? 2 : 4} />
        </tr>
      </tfoot>
    </table>
  );
}

/** 정산월 전달 영업사원의 한샘추가시공비 행 목록 */
function ExtraCostTable({ rows, total }: { rows: SettlementExtraCost[]; total: number }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-zinc-100 text-xs text-zinc-600">
        <tr>
          <th className={`${TH} text-left`}>시공시작일</th>
          <th className={`${TH} text-left`}>현장코드</th>
          <th className={`${TH} text-left`}>고객</th>
          <th className={`${TH} text-left`}>요청번호</th>
          <th className={`${TH} text-left`}>시공유형</th>
          <th className={`${TH} text-left`}>항목</th>
          <th className={`${TH} text-right`}>수량</th>
          <th className={`${TH} text-left`}>시공협력사</th>
          <th className={`${TH} text-left`}>청구처</th>
          <th className={`${TH} text-left`}>확정</th>
          <th className={`${TH} text-right`}>시공비</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.현장코드 ?? ""}-${r.요청번호 ?? "none"}-${i}`} className="text-zinc-700">
            <td className={`${TD} tabular-nums`}>{r.시공시작일}</td>
            <td className={`${TD} tabular-nums`}>{r.현장코드}</td>
            <td className={TD}>{r.고객}</td>
            <td className={`${TD} tabular-nums`}>{r.요청번호}</td>
            <td className={TD}>{r.시공유형}</td>
            <td className={TD}>{r.항목}</td>
            <td className={`${TD} ${NUM}`}>{r.수량}</td>
            <td className={TD}>{r.시공협력사명}</td>
            <td className={TD}>{r.청구처}</td>
            <td className={TD}>{r.확정여부}</td>
            <td className={`${TD} ${NUM}`}>
              {r.시공비 !== null ? formatMoney(r.시공비) : <span className="text-amber-700">{r.시공비원문}</span>}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-zinc-100 font-semibold">
        <tr>
          <td colSpan={10} className="px-3 py-2">합계 (부가세포함)</td>
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function ToggleButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
    >
      {open ? "접기" : "상세"}
    </button>
  );
}

/** 입금구분별 합계. 상세를 누르면 그 구분의 내역 전체를 펼친다 */
function CategoryTable({ rows, total }: { rows: SettlementDeposit[]; total?: number }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // 숫자로 읽을 수 없는 금액은 소계에서 제외
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: SettlementDeposit[]; sum: number }>();
    for (const r of rows) {
      const name = r.입금구분?.trim() || "(구분 없음)";
      const group = map.get(name) ?? { name, rows: [], sum: 0 };
      group.rows.push(r);
      group.sum += r.금액 ?? 0;
      map.set(name, group);
    }
    return [...map.values()];
  }, [rows]);
  const allOpen = groups.every((g) => expanded.has(g.name));

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  return (
    <table className="min-w-full text-sm">
      <thead className="bg-zinc-100 text-xs text-zinc-600">
        <tr>
          <th className={`${TH} text-left`}>입금구분</th>
          <th className={`${TH} text-left`}>날짜</th>
          <th className={`${TH} text-left`}>입금자</th>
          <th className={`${TH} text-left`}>입금내용</th>
          <th className={`${TH} text-left`}>업체</th>
          <th className={`${TH} text-right`}>금액</th>
          <th className={`${TH} w-20 text-center`}>
            <button
              type="button"
              onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.name)))}
              className="font-medium text-blue-700 hover:underline"
            >
              {allOpen ? "모두 접기" : "모두 보기"}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const open = expanded.has(g.name);
          return (
            <Fragment key={g.name}>
              <tr className="font-medium text-zinc-900">
                <td className={TD}>
                  {g.name} <span className="ml-1 text-xs font-normal text-zinc-500">{g.rows.length}건</span>
                </td>
                <td colSpan={4} className={TD} />
                <td className={`${TD} ${NUM}`}>{formatMoney(g.sum)}</td>
                <td className={`${TD} text-center`}>
                  <ToggleButton open={open} onClick={() => toggle(g.name)} />
                </td>
              </tr>
              {open &&
                g.rows.map((r) => (
                  <tr key={r.id} className="bg-zinc-50 text-zinc-700">
                    <td className={TD} />
                    <td className={`${TD} tabular-nums`}>{r.날짜}</td>
                    <td className={TD}>{r.입금자}</td>
                    <td className={TD}>{r.입금내용}</td>
                    <td className={TD}>{r.업체}</td>
                    <td className={`${TD} ${NUM}`}>
                      {r.금액 !== null ? formatMoney(r.금액) : <span className="text-amber-700">{r.금액원문}</span>}
                    </td>
                    <td className={TD} />
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
      {total !== undefined && (
        <tfoot className="bg-zinc-100 font-semibold">
          <tr>
            <td colSpan={5} className="px-3 py-2">합계</td>
            <td className={`px-3 py-2 ${NUM}`}>{formatMoney(total)}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

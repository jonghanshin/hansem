"use client";

import { Fragment, useMemo, useState, useTransition } from "react";

import { computeSettlementAction } from "@/app/settlement-actions";
import type { SettlementCandidate, SettlementDeposit, SettlementExtraCost, SettlementLine, SettlementResult } from "@/lib/settlement";
import { UPLOAD_TABLE_KEYS, UPLOAD_TABLES, type UploadTable } from "@/lib/settlement-upload";
import { formatMoney, withoutVat, withVat } from "@/lib/sites";

import { SettlementUploadDialog } from "./settlement-upload-dialog";

type OutflowGroup = "한샘" | "홈씨씨" | "시공비포함" | "시공비미포함" | "기타";
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

function Money({ value }: { value: number | null }) {
  return value === null ? <span className="text-zinc-300">-</span> : formatMoney(value);
}

const MAIN_OUTFLOW_GROUPS = ["홈씨씨", "시공비"];
const VAT_EXCLUDED = "미포함";
/** 정산대상금액 계산 시 이익금액 합계에서 빼는 공제금 */
const DEDUCTION = 2_500_000;

/** 총출금액의 구성: 한샘(부가세 포함 공급가+추가시공비)·홈씨씨·시공비(한샘외, 부가세 포함/미포함)·기타 */
function outflowParts(line: SettlementLine) {
  return {
    한샘: line.한샘["공급가(부가세포함)"] + line.한샘.추가시공비,
    홈씨씨: rowsSum(outflowRows(line, "홈씨씨")),
    시공비포함: rowsSum(outflowRows(line, "시공비포함")),
    시공비미포함: rowsSum(outflowRows(line, "시공비미포함")),
    기타: rowsSum(outflowRows(line, "기타")),
  };
}

/** 정산결과 표의 금액: 부가세가 포함된 한샘·홈씨씨·시공비는 부가세를 뺀다 */
function netOutflowParts(line: SettlementLine) {
  const parts = outflowParts(line);
  return {
    ...parts,
    한샘: withoutVat(parts.한샘),
    홈씨씨: withoutVat(parts.홈씨씨),
    시공비포함: withoutVat(parts.시공비포함),
  };
}

/** 이익금액: 계약금(부가세제외) - 부가세 제외 총출금액. 계약금이 없으면 null */
function netProfit(line: SettlementLine) {
  if (line.계약금 === null) return null;
  return withoutVat(line.계약금) - Object.values(netOutflowParts(line)).reduce((a, b) => a + b, 0);
}

/** 정산금액: 정산대상금액을 구간별 근로자 비율(30·35·40%)로 누진 계산 */
function workerShare(amount: number) {
  const tier1 = Math.min(amount, 5_000_000);
  const tier2 = Math.max(Math.min(amount, 10_000_000) - 5_000_000, 0);
  const tier3 = Math.max(amount - 10_000_000, 0);
  return Math.round((tier1 * 30 + tier2 * 35 + tier3 * 40) / 100);
}

/** 이익금액 합계에서 공제금을 뺀 정산대상금액과, 그 결과인 이월금액 또는 정산금액 */
function SettlementSummary({ lines }: { lines: SettlementLine[] }) {
  const profit = lines.reduce((acc, l) => acc + (netProfit(l) ?? 0), 0);
  const target = profit - DEDUCTION;
  const items: [string, number][] = [
    ["이익금액 합계", profit],
    ["공제금", -DEDUCTION],
    ["정산대상금액", target],
  ];
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <dl className="ml-auto max-w-sm space-y-1">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-6">
            <dt className="text-zinc-600">{label}</dt>
            <dd className="tabular-nums text-zinc-900">{formatMoney(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-6 border-t border-zinc-200 pt-1 font-semibold">
          <dt className="text-zinc-900">{target < 0 ? "이월금액" : "정산금액"}</dt>
          <dd className={`tabular-nums ${target < 0 ? "text-red-600" : "text-blue-700"}`}>
            {formatMoney(target < 0 ? target : workerShare(target))}
          </dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-zinc-200 pt-2 text-xs leading-relaxed text-zinc-600">
        <p>이익금액 = 계약금(부가세제외) - 총출금액 합계</p>
        <p>정산대상금액 = 이익금액 합계 - 공제금({formatMoney(DEDUCTION)}원)</p>
        <p>정산대상금액이 -이면 이월금액, +이면 아래 공식으로 계산한 정산금액(근로자 몫)을 표시합니다.</p>
        <p className="mt-1 font-semibold text-zinc-700">정산대상금액 기준 정산 공식</p>
        <ol className="mt-0.5 list-decimal pl-4">
          <li>월 이익 500만원 이하 구간: 사업주 70% : 근로자 30%</li>
          <li>월 이익 500만원 초과 1,000만원 이하 구간: 사업주 65% : 근로자 35%</li>
          <li>월 이익 1,000만원 초과 구간: 사업주 60% : 근로자 40%</li>
        </ol>
        <p className="mt-1">위 구간별 비율은 누진 적용한다. (예시: 월 이익 800만원인 경우 → 500만원×70:30 + 300만원×65:35 로 각각 계산 후 합산)</p>
      </div>
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

export function SettlementView({ sites }: { sites: SettlementCandidate[] }) {
  const [sales, setSales] = useState("");
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<{ line: SettlementLine; group: DetailGroup; netOfVat: boolean } | null>(null);
  const [uploadTable, setUploadTable] = useState<UploadTable | null>(null);

  const salesOptions = useMemo(() => options(sites.map((s) => s.영업사원)).sort((a, b) => a.localeCompare(b, "ko")), [sites]);
  const monthOptions = useMemo(
    () => options(sites.map((s) => s.정산월)).sort((a, b) => monthOrder(a) - monthOrder(b) || a.localeCompare(b, "ko")),
    [sites],
  );
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

  const openDetail = (line: SettlementLine, group: DetailGroup) => setDetail({ line, group, netOfVat: false });
  const openNetDetail = (line: SettlementLine, group: DetailGroup) => setDetail({ line, group, netOfVat: true });

  return (
    <div className="flex-1 space-y-4 overflow-auto p-4 sm:p-6 lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-zinc-900">
          정산 <span className="ml-1 text-sm font-normal text-zinc-500">미정산 현장 {rows.length}건</span>
        </h1>
        <div className="flex flex-wrap gap-2">
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

      {result && (
        <section aria-labelledby="settlement-result" className="space-y-2">
          <h2 id="settlement-result" className="text-base font-semibold text-zinc-900">
            정산대상 <span className="ml-1 text-sm font-normal text-zinc-500">{result.lines.length}개 현장</span>
          </h2>
          {result.warnings.length > 0 && (
            <p role="status" className="whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.warnings.join("\n")}
            </p>
          )}
          <SettlementTable lines={result.lines} onDetail={openDetail} />
        </section>
      )}

      {result && (
        <section aria-labelledby="settlement-net" className="space-y-2">
          <h2 id="settlement-net" className="text-base font-semibold text-zinc-900">
            정산결과 <span className="ml-1 text-sm font-normal text-zinc-500">{result.lines.length}개 현장</span>
          </h2>
          <SettlementTable lines={result.lines} netOfVat onDetail={openNetDetail} />
          <SettlementSummary lines={result.lines} />
        </section>
      )}

      {detail && <DepositDetailDialog line={detail.line} group={detail.group} netOfVat={detail.netOfVat} onClose={() => setDetail(null)} />}
    </div>
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

const rowsSum = (rows: SettlementDeposit[]) => rows.reduce((acc, r) => acc + (r.금액 ?? 0), 0);

function outflowRows(line: SettlementLine, group: OutflowGroup) {
  return line.출금내역.filter((r) => {
    if (group === "기타") return !MAIN_OUTFLOW_GROUPS.includes(r.묶음);
    if (group !== "시공비포함" && group !== "시공비미포함") return r.묶음 === group;
    // 부가세포함 값이 없는 예전 내역은 입력 기본값과 같이 포함으로 본다
    return r.묶음 === "시공비" && (r.부가세포함 === VAT_EXCLUDED) === (group === "시공비미포함");
  });
}

function hasOutflowDetail(line: SettlementLine, group: OutflowGroup) {
  return group === "한샘"
    ? line.한샘.주문.length > 0 || line.한샘.추가시공비내역.length > 0
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
      onKeyDown={(e) => e.key === "Escape" && onClose()}
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
                공급가(HS) {formatMoney(line.한샘["공급가(HS)"])} · 공급가(S1) {formatMoney(line.한샘["공급가(S1)"])} · 추가시공비{" "}
                {formatMoney(netOfVat ? withoutVat(line.한샘.추가시공비) : line.한샘.추가시공비)}
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

const vatOf = (amount: number | null) => (amount === null ? null : withVat(amount));

/** 한샘주문진도정보의 확정 주문별 공급가 */
function HansemOrders({ hansem, netOfVat }: { hansem: SettlementLine["한샘"]; netOfVat: boolean }) {
  const [showExtra, setShowExtra] = useState(false);
  // 세로 합계가 표와 맞도록 주문별 부가세 포함 금액을 더한다
  const grossTotal = hansem["공급가(부가세포함)"] + hansem.추가시공비;
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
          <td colSpan={netOfVat ? 4 : 5} className="px-3 py-2">
            {netOfVat ? "추가시공비(부가세제외)" : "추가시공비"} <span className="ml-1 text-xs font-normal text-zinc-500">{hansem.추가시공비내역.length}건</span>
          </td>
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(netOfVat ? withoutVat(hansem.추가시공비) : hansem.추가시공비)}</td>
          <td colSpan={netOfVat ? 2 : 4} className="px-3 py-2">
            {hansem.추가시공비내역.length > 0 && <ToggleButton open={showExtra} onClick={() => setShowExtra((v) => !v)} />}
          </td>
        </tr>
        {showExtra && (
          <tr>
            <td colSpan={netOfVat ? 7 : 10} className="bg-zinc-50 p-3 font-normal">
              <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
                <ExtraCostTable rows={hansem.추가시공비내역} />
              </div>
            </td>
          </tr>
        )}
        <tr>
          <td colSpan={netOfVat ? 4 : 5} className="px-3 py-2">{netOfVat ? "한샘(부가세제외) 합계" : "한샘(부가세포함) 합계"}</td>
          <td className={`px-3 py-2 ${NUM}`}>{formatMoney(netOfVat ? withoutVat(grossTotal) : grossTotal)}</td>
          <td colSpan={netOfVat ? 2 : 4} />
        </tr>
      </tfoot>
    </table>
  );
}

/** 현장의 한샘추가시공비 테이블 행 목록 */
function ExtraCostTable({ rows }: { rows: SettlementExtraCost[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-zinc-100 text-xs text-zinc-600">
        <tr>
          <th className={`${TH} text-left`}>시공시작일</th>
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
          <tr key={`${r.요청번호 ?? "none"}-${i}`} className="text-zinc-700">
            <td className={`${TD} tabular-nums`}>{r.시공시작일}</td>
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

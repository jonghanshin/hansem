"use client";

import { useMemo, useState, useTransition } from "react";

import { deletePayslipAction, savePayslipAction } from "@/app/payroll-actions";
import { BonusDetailButton } from "@/app/bonus-detail-button";
import { PayslipView } from "@/app/payslip-view";
import { PrintButton } from "@/app/print-button";
import {
  computeDeductions,
  computeTotals,
  defaultEarnings,
  defaultPayDate,
  EARNING_KEYS,
  formatMonth,
  formatWon,
  isPosition,
  POSITIONS,
  PROBATION,
  settlementMonthFor,
  type Bonus,
  type EarningKey,
  type Earnings,
  type Payslip,
  type PayrollBase,
  type Position,
} from "@/lib/payroll-shared";

import { AmountInput, INPUT, parseAmount } from "./amount-input";

const EARNING_HINTS: Partial<Record<EarningKey, string>> = {
  기본급: "과세",
  성과급: "이익배분금, 매월 정산액 입력",
};

function toStrings(e: Earnings): Record<EarningKey, string> {
  return Object.fromEntries(EARNING_KEYS.map((k) => [k, String(e[k])])) as Record<EarningKey, string>;
}

/**
 * 직원 한 명의 한 달 월급명세서 작성. 직급은 권한 테이블의 직급을 따르고, 그 직급의 기준정보로 지급액이 채워진다.
 * 공제액은 자동 계산된다
 */
export function SlipEditor({
  user,
  authPosition,
  month,
  base,
  existing,
  previous,
  bonus,
}: {
  /** 직급·입사일은 권한 테이블 값 */
  user: { id: number; 이름: string; 직급: string | null; 입사일: string | null; 기본급: number | null };
  /** 권한.직급을 급여 직급으로 바꾼 값. null이면(실장·빈 값 등) 화면에서 고른다 */
  authPosition: Position | null;
  month: string;
  base: PayrollBase;
  existing: Payslip | null;
  /** 새로 작성할 때 부서·호봉 등을 가져올 이전 명세서 */
  previous: Payslip | null;
  /** 한 달 전 정산월의 확정 정산금. 있으면 성과급은 이 금액으로 고정 */
  bonus: Bonus | null;
}) {
  const source = existing ?? previous;
  const initialPosition: Position = authPosition ?? (isPosition(source?.직급) ? (source.직급 as Position) : PROBATION);
  // 저장된 명세서의 직급이 지금 권한 테이블 직급과 다르면 직책수당·차량유지비·식대를 새 직급으로 다시 채운다
  const positionChanged = !!existing && existing.직급 !== initialPosition;
  const [position, setPosition] = useState<Position>(initialPosition);
  const [earnings, setEarnings] = useState<Record<EarningKey, string>>(() => {
    const d = defaultEarnings(base, initialPosition, user.기본급);
    const filled = !existing
      ? toStrings(d)
      : positionChanged
        ? { ...toStrings(existing.지급), 직책수당: String(d.직책수당), 차량유지비: String(d.차량유지비), 식대: String(d.식대) }
        : toStrings(existing.지급);
    return bonus ? { ...filled, 성과급: String(bonus.금액) } : filled;
  });
  const [incomeTax, setIncomeTax] = useState(String(existing?.공제.소득세 ?? base.소득세));
  // 입사일은 권한 테이블 값을 쓴다. 권한 테이블에 없을 때만 직접 입력 (이전 명세서 값으로 채운다)
  const [hireDate, setHireDate] = useState(user.입사일 ?? source?.입사일 ?? "");
  const [dept, setDept] = useState(source?.부서 ?? "");
  const [grade, setGrade] = useState(source?.호봉 ?? "");
  const [payDate, setPayDate] = useState(existing?.지급일 ?? defaultPayDate(month, base));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(
    () => Object.fromEntries(EARNING_KEYS.map((k) => [k, parseAmount(earnings[k]) || 0])) as Earnings,
    [earnings],
  );
  const tax = parseAmount(incomeTax) || 0;
  const deductions = computeDeductions(base, parsed, tax);
  const totals = computeTotals(parsed, deductions);

  function changePosition(p: Position) {
    setPosition(p);
    // 직급에 따라 달라지는 직책수당·차량유지비·식대만 기준값으로 바꾼다 (성과급 등 입력한 값은 그대로)
    const d = defaultEarnings(base, p, user.기본급);
    setEarnings((s) => ({ ...s, 직책수당: String(d.직책수당), 차량유지비: String(d.차량유지비), 식대: String(d.식대) }));
  }

  function resetToBase() {
    setEarnings((s) => ({ ...toStrings(defaultEarnings(base, position, user.기본급)), 성과급: s.성과급, 최소실적지원금: s.최소실적지원금 }));
    setIncomeTax(String(base.소득세));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await savePayslipAction({
        사용자: user.id,
        귀속월: month,
        직급: position,
        입사일: hireDate,
        부서: dept,
        호봉: grade,
        지급일: payDate,
        지급: Object.fromEntries(EARNING_KEYS.map((k) => [k, parseAmount(earnings[k])])) as Earnings,
        소득세: parseAmount(incomeTax),
      });
      setMessage(r.ok ? { ok: true, text: "저장했습니다" } : { ok: false, text: r.error });
    });
  }

  function remove() {
    if (!confirm(`${user.이름}님의 ${formatMonth(month)}분 명세서를 삭제할까요?`)) return;
    setMessage(null);
    startTransition(async () => {
      const r = await deletePayslipAction(user.id, month);
      setMessage(r.ok ? { ok: true, text: "삭제했습니다" } : { ok: false, text: r.error });
    });
  }

  const supportHint =
    position !== PROBATION && parsed.성과급 < base.최소실적지원금 && parsed.최소실적지원금 === 0 ? (
      <button
        type="button"
        onClick={() => setEarnings((s) => ({ ...s, 최소실적지원금: String(base.최소실적지원금) }))}
        className="font-normal text-blue-600 hover:underline"
      >
        성과급이 {formatWon(base.최소실적지원금)}원 미만 → 지원금 적용
      </button>
    ) : position === PROBATION ? (
      <span className="font-normal text-zinc-400">수습기간 미지급</span>
    ) : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <section className="space-y-4 self-start rounded-xl border border-zinc-200 bg-white p-4 shadow-sm print:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            {user.이름} · {formatMonth(month)}분
          </h2>
          <span className={`text-xs ${existing ? "text-emerald-700" : "text-zinc-400"}`}>
            {existing ? `저장됨 (${existing.작성자 ?? ""})` : "미작성"}
          </span>
        </div>

        <div>
          <span className={LABEL}>
            직급
            {authPosition ? (
              <span className="font-normal text-zinc-400">권한 테이블 직급({user.직급})</span>
            ) : (
              <span className="font-normal text-amber-700">
                권한 테이블 직급({user.직급 ?? "없음"})이 급여 직급이 아니어서 직접 선택합니다
              </span>
            )}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changePosition(p)}
                disabled={!!authPosition && p !== position}
                aria-pressed={position === p}
                className={`rounded-full px-3 py-1 text-sm font-medium disabled:opacity-40 ${
                  position === p
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-300 bg-white text-zinc-600 enabled:hover:bg-zinc-100"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {positionChanged && (
            <p className="mt-1.5 text-xs text-amber-700">
              저장된 명세서의 직급({existing?.직급})과 권한 테이블 직급이 달라 직책수당·차량유지비·식대를 다시 계산했습니다. 확인 후 저장하세요.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>
              입사일 <span className="font-normal text-zinc-400">{user.입사일 ? "권한 테이블" : "권한 테이블에 없음"}</span>
            </span>
            {user.입사일 ? (
              <input value={user.입사일} readOnly className={`${INPUT} bg-zinc-50 text-zinc-600 tabular-nums`} />
            ) : (
              <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className={INPUT} />
            )}
          </label>
          <label className="block">
            <span className={LABEL}>지급일</span>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>부서</span>
            <input value={dept} onChange={(e) => setDept(e.target.value)} maxLength={50} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>호봉</span>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={20} className={INPUT} />
          </label>
        </div>

        <div className="space-y-2.5 border-t border-zinc-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900">지급내역</span>
            <button type="button" onClick={resetToBase} className="text-xs text-blue-600 hover:underline">
              기준정보 값으로 다시 채우기
            </button>
          </div>
          {EARNING_KEYS.map((k) => (
            <label key={k} className="block">
              <span className={LABEL}>
                {k}
                {k === "최소실적지원금" ? (
                  supportHint
                ) : k === "성과급" ? (
                  bonus ? (
                    <span className="font-normal text-emerald-700">{bonus.정산월} 정산정보 확정 정산금</span>
                  ) : (
                    <span className="font-normal text-zinc-400">
                      {settlementMonthFor(month)} 확정 정산정보 없음, 직접 입력
                    </span>
                  )
                ) : (
                  EARNING_HINTS[k] && (
                    <span className="font-normal text-zinc-400">
                      {EARNING_HINTS[k]}
                      {k === "기본급" && user.기본급 !== null && ` · 개인 기본급 ${formatWon(user.기본급)}원 (권한 테이블)`}
                    </span>
                  )
                )}
              </span>
              {k === "성과급" && bonus ? (
                <span className="flex items-center gap-1.5">
                  <input
                    value={formatWon(bonus.금액)}
                    readOnly
                    className={`${INPUT} bg-zinc-50 text-right text-zinc-600 tabular-nums`}
                  />
                  <span className="text-sm text-zinc-500">원</span>
                </span>
              ) : (
                <AmountInput value={earnings[k]} onChange={(v) => setEarnings((s) => ({ ...s, [k]: v }))} />
              )}
            </label>
          ))}
        </div>

        <div className="space-y-2.5 border-t border-zinc-100 pt-3">
          <span className="text-xs font-semibold text-zinc-900">공제내역</span>
          <label className="block">
            <span className={LABEL}>
              소득세 <span className="font-normal text-zinc-400">간이세액표 기준으로 입력</span>
            </span>
            <AmountInput value={incomeTax} onChange={setIncomeTax} />
          </label>
          <p className="text-xs leading-relaxed text-zinc-500">
            국민연금 {base.국민연금요율}% · 건강보험 {base.건강보험요율}% · 장기요양 {base.장기요양요율}% · 고용보험 {base.고용보험요율}%는
            기본급으로, 지방소득세 {base.지방소득세율}%는 소득세로 자동 계산합니다.
          </p>
        </div>

        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
          >
            {message.text}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              삭제
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "저장 중…" : existing ? "수정 저장" : "명세서 저장"}
          </button>
        </div>
      </section>

      <section className="self-start rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 print:border-0 print:p-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
          <span className="text-xs font-medium text-zinc-500">미리보기</span>
          <PrintButton />
        </div>
        <PayslipView
          bonusSlot={bonus ? <BonusDetailButton month={month} userId={user.id} /> : undefined}
          slip={{
            귀속월: month,
            이름: user.이름,
            직급: position,
            입사일: user.입사일 ?? (hireDate || null),
            부서: dept || null,
            호봉: grade || null,
            지급일: payDate || null,
            지급: parsed,
            공제: deductions,
            ...totals,
          }}
        />
      </section>
    </div>
  );
}

const LABEL = "mb-1 flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-zinc-700";

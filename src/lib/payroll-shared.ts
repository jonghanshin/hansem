// 급여: 연도별 기준정보와 월급명세서 계산 (화면·서버 공용).
// 계산 방식은 '나비아키텍처_월급표_v4.xlsx'를 따른다.
//  - 기본급 외 지급항목(직책수당·차량유지비·식대·성과급·최소실적지원금)은 비과세
//  - 4대보험은 기본급에 요율을 곱해 원 단위 반올림, 장기요양보험료는 건강보험료에 요율을 곱한다
//  - 소득세는 간이세액표 기준으로 직접 입력, 지방소득세는 소득세의 10%

/** 기준정보에 직책수당이 있는 직급 */
export const ALLOWANCE_POSITIONS = ["수습사원", "대리", "과장", "차장", "팀장"] as const;
export type AllowancePosition = (typeof ALLOWANCE_POSITIONS)[number];

/** 실장: 기본급(+성과급)만 받는다. 직책수당·차량유지비·식대는 지급하지 않는다 */
export const BASE_ONLY_POSITION = "실장";

export const POSITIONS = [...ALLOWANCE_POSITIONS, BASE_ONLY_POSITION] as const;
export type Position = (typeof POSITIONS)[number];

export function isPosition(v: unknown): v is Position {
  return typeof v === "string" && (POSITIONS as readonly string[]).includes(v);
}

/**
 * 권한.직급 값 → 급여 직급. '수습'은 수습사원으로 본다.
 * 급여 직급이 아닌 값(대표 등)이나 빈 값이면 null (관리자가 직접 고른다)
 */
export function positionFromAuth(raw: string | null | undefined): Position | null {
  const v = (raw ?? "").replace(/\s/g, "");
  if (v === "수습" || v === "수습사원" || v === "사원") return "수습사원";
  return isPosition(v) ? v : null;
}

/** 수습기간에는 차량유지비·최소실적지원금을 지급하지 않는다 (회사내규 제6조·제21조·제27조) */
export const PROBATION: Position = "수습사원";

export type PayrollBase = {
  /** 요율은 % 값 (4.75 = 4.75%) */
  국민연금요율: number;
  건강보험요율: number;
  /** 건강보험료 대비 % */
  장기요양요율: number;
  고용보험요율: number;
  /** 소득세 대비 % */
  지방소득세율: number;
  /** 원 */
  기본급: number;
  식대: number;
  차량유지비: number;
  최소실적지원금: number;
  /** 간이세액표 기준 소득세 기본값 (명세서마다 고칠 수 있다) */
  소득세: number;
  /** 매월 지급일 (1~31, 그 달에 없는 날이면 말일) */
  지급일: number;
  직책수당: Record<AllowancePosition, number>;
};

/** 기준정보를 아직 저장하지 않은 연도에 쓰는 값 (2026년 월급표 기준) */
export const DEFAULT_BASE: PayrollBase = {
  국민연금요율: 4.75,
  건강보험요율: 3.595,
  장기요양요율: 13.14,
  고용보험요율: 0.9,
  지방소득세율: 10,
  기본급: 2156880,
  식대: 200000,
  차량유지비: 200000,
  최소실적지원금: 200000,
  소득세: 24340,
  지급일: 29,
  직책수당: { 수습사원: 0, 대리: 0, 과장: 100000, 차장: 150000, 팀장: 200000 },
};

export const RATE_FIELDS = [
  { key: "국민연금요율", label: "국민연금 요율 (근로자 부담)", hint: "기본급 × 요율" },
  { key: "건강보험요율", label: "건강보험 요율 (근로자 부담)", hint: "기본급 × 요율" },
  { key: "장기요양요율", label: "장기요양보험료율", hint: "건강보험료 × 요율" },
  { key: "고용보험요율", label: "고용보험 요율 (근로자 부담)", hint: "기본급 × 요율" },
  { key: "지방소득세율", label: "지방소득세율", hint: "소득세 × 요율" },
] as const satisfies readonly { key: keyof PayrollBase; label: string; hint: string }[];

export const AMOUNT_FIELDS = [
  { key: "기본급", label: "기본급", hint: "과세 (4대보험·소득세 계산 기준)" },
  { key: "식대", label: "식대", hint: "비과세" },
  { key: "차량유지비", label: "차량유지비", hint: "비과세, 수습 후 지급" },
  { key: "최소실적지원금", label: "최소실적지원금", hint: "비과세, 수습 후 성과급이 이 금액에 못 미칠 때만" },
  { key: "소득세", label: "소득세 기본값", hint: "간이세액표 기준, 명세서마다 수정 가능" },
] as const satisfies readonly { key: keyof PayrollBase; label: string; hint: string }[];

export const EARNING_KEYS = ["기본급", "직책수당", "차량유지비", "식대", "성과급", "최소실적지원금"] as const;
export type EarningKey = (typeof EARNING_KEYS)[number];
export type Earnings = Record<EarningKey, number>;

export const DEDUCTION_KEYS = ["국민연금", "건강보험", "장기요양보험료", "고용보험", "소득세", "지방소득세"] as const;
export type DeductionKey = (typeof DEDUCTION_KEYS)[number];
export type Deductions = Record<DeductionKey, number>;

export type Payslip = {
  id: number;
  사용자: number;
  이름: string;
  /** YYYY-MM */
  귀속월: string;
  직급: string;
  입사일: string | null;
  부서: string | null;
  호봉: string | null;
  지급일: string | null;
  지급: Earnings;
  공제: Deductions;
  지급액계: number;
  공제액계: number;
  차인지급액: number;
  작성자: string | null;
  수정일시: string;
};

/** 명세서 저장 입력 (공제액은 서버가 기준정보로 다시 계산한다. 소득세만 직접 입력) */
export type PayslipInput = {
  사용자: number;
  귀속월: string;
  직급: string;
  입사일: string;
  부서: string;
  호봉: string;
  지급일: string;
  지급: Earnings;
  소득세: number;
};

/** 직원 화면에 명세서가 보이기 시작하는 날 (귀속월의 이 날부터) */
export const RELEASE_DAY = 28;

export function isYearMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function isYmdDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * 날짜 문자열을 YYYY-MM-DD로 맞춘다. 권한.입사일처럼 직접 입력한 값
 * ("2026 09-01", "2026.9.1", "2026/09/01", "20260901" 등)을 받아 준다. 날짜가 아니면 null
 */
export function normalizeYmd(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  const m = /^(\d{4})[\s./-]*(\d{1,2})[\s./-]*(\d{1,2})/.exec(s);
  if (!m) return null;
  const ymd = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isYmdDate(ymd) ? ymd : null;
}

/** 귀속월(YYYY-MM)의 명세서를 직원이 볼 수 있는지 (그 달 RELEASE_DAY일부터) */
export function isReleased(month: string, today: string): boolean {
  return today >= `${month}-${String(RELEASE_DAY).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 귀속월의 지급일 (기준정보의 지급일, 그 달에 없는 날이면 말일) */
export function defaultPayDate(month: string, base: PayrollBase): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, Math.trunc(base.지급일) || 1), last);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** 금액 × 요율(%)을 원 단위 반올림 (엑셀 ROUND(x, 0)과 같게) */
function applyRate(amount: number, ratePercent: number): number {
  return Math.round(Number(((amount * ratePercent) / 100).toFixed(6)));
}

/**
 * 직급에 맞는 지급항목 기본값 (성과급은 매월 정산액을 입력한다).
 * personalBase: 권한.기본급 (개인 기본급). 있으면 기준정보 기본급 대신 쓴다
 */
export function defaultEarnings(base: PayrollBase, position: Position, personalBase?: number | null): Earnings {
  const 기본급 = personalBase ?? base.기본급;
  if (position === BASE_ONLY_POSITION) {
    return { 기본급, 직책수당: 0, 차량유지비: 0, 식대: 0, 성과급: 0, 최소실적지원금: 0 };
  }
  const probation = position === PROBATION;
  return {
    기본급,
    직책수당: base.직책수당[position] ?? 0,
    차량유지비: probation ? 0 : base.차량유지비,
    식대: base.식대,
    성과급: 0,
    최소실적지원금: 0,
  };
}

/** 공제액 계산: 4대보험은 기본급(과세분) 기준, 지방소득세는 소득세 기준 */
export function computeDeductions(base: PayrollBase, earnings: Earnings, incomeTax: number): Deductions {
  const taxable = earnings.기본급;
  const health = applyRate(taxable, base.건강보험요율);
  return {
    국민연금: applyRate(taxable, base.국민연금요율),
    건강보험: health,
    장기요양보험료: applyRate(health, base.장기요양요율),
    고용보험: applyRate(taxable, base.고용보험요율),
    소득세: incomeTax,
    지방소득세: applyRate(incomeTax, base.지방소득세율),
  };
}

export function computeTotals(earnings: Earnings, deductions: Deductions) {
  const 지급액계 = EARNING_KEYS.reduce((n, k) => n + earnings[k], 0);
  const 공제액계 = DEDUCTION_KEYS.reduce((n, k) => n + deductions[k], 0);
  return { 지급액계, 공제액계, 차인지급액: 지급액계 - 공제액계 };
}

const MAX_AMOUNT = 1_000_000_000;

function isAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < MAX_AMOUNT;
}

function isRate(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/** 저장된(또는 화면에서 보낸) 기준정보를 검사한다. 잘못되면 오류 문구 */
export function validateBase(v: unknown): PayrollBase | string {
  if (typeof v !== "object" || v === null) return "기준정보가 올바르지 않습니다";
  const o = v as Record<string, unknown>;
  for (const f of RATE_FIELDS) if (!isRate(o[f.key])) return `${f.label}은(는) 0~100 사이의 숫자로 입력하세요`;
  for (const f of AMOUNT_FIELDS) if (!isAmount(o[f.key])) return `${f.label}은(는) 0 이상의 정수로 입력하세요`;
  const day = o.지급일;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) return "지급일은 1~31 사이로 입력하세요";
  const allowance = o.직책수당 as Record<string, unknown> | undefined;
  if (typeof allowance !== "object" || allowance === null) return "직책수당이 올바르지 않습니다";
  for (const p of ALLOWANCE_POSITIONS) if (!isAmount(allowance[p])) return `직책수당(${p})은 0 이상의 정수로 입력하세요`;
  return {
    ...Object.fromEntries([...RATE_FIELDS, ...AMOUNT_FIELDS].map((f) => [f.key, o[f.key] as number])),
    지급일: day,
    직책수당: Object.fromEntries(ALLOWANCE_POSITIONS.map((p) => [p, allowance[p] as number])) as Record<AllowancePosition, number>,
  } as PayrollBase;
}

// ---------- 성과급: 정산정보 연동 ----------
// 명세서 귀속월보다 한 달 전 정산월의 정산정보가 확정(확정여부 = 'Y')이면 그 정산금을 성과급으로 쓴다.
// (정산이 나중에 확정돼도 명세서를 다시 저장하지 않아도 되도록, 보여줄 때 적용한다)

/** 정산정보.확정여부의 확정 값 (정산 화면의 확정 버튼은 'Y'로 저장한다. 예전에 직접 넣은 '확정'도 인정) */
export const SETTLEMENT_CONFIRMED_VALUES: readonly string[] = ["Y", "확정"];

export type ConfirmedSettlement = { 영업사원: string; 영업사원ID: string; 정산월: string; 정산금: number };
export type BonusPerson = { 영업사원ID: string; 이름: string };
export type Bonus = { 정산월: string; 금액: number };

/** 명세서 귀속월 → 성과급을 가져올 정산월 (한 달 전) */
export function settlementMonthFor(month: string): string {
  return shiftMonth(month, -1);
}

/** 정산정보.정산금("3,525,672") → 숫자. 음수·잘못된 값은 0 */
export function parseSettlementAmount(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s원]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** 정산정보의 영업사원이 이 사람인지 (영업사원ID가 있으면 ID로, 없으면 이름으로) */
export function matchesPerson(row: Pick<ConfirmedSettlement, "영업사원" | "영업사원ID">, p: BonusPerson): boolean {
  if (row.영업사원ID && p.영업사원ID) return row.영업사원ID === p.영업사원ID;
  return row.영업사원 !== "" && row.영업사원 === p.이름;
}

/** 이 사람·귀속월의 성과급 (확정된 정산정보가 없으면 null). 같은 달이 여러 건이면 가장 최근 것 */
export function bonusFor(rows: readonly ConfirmedSettlement[], person: BonusPerson, month: string): Bonus | null {
  const settle = settlementMonthFor(month);
  const row = rows.find((r) => r.정산월 === settle && matchesPerson(r, person));
  return row ? { 정산월: settle, 금액: row.정산금 } : null;
}

/** 명세서의 성과급을 확정 정산금으로 바꾸고 합계를 다시 계산한다 (성과급은 비과세라 공제액은 그대로) */
export function withBonus<T extends { 지급: Earnings; 공제: Deductions; 지급액계: number; 공제액계: number; 차인지급액: number }>(
  slip: T,
  bonus: Bonus | null,
): T {
  if (!bonus) return slip;
  const 지급 = { ...slip.지급, 성과급: bonus.금액 };
  return { ...slip, 지급, ...computeTotals(지급, slip.공제) };
}

/** DB에 저장된 기준정보: 빠진 값은 기본값으로 채운다 (나중에 항목이 늘어도 예전 연도가 깨지지 않게) */
export function normalizeBase(v: unknown): PayrollBase {
  const o = typeof v === "object" && v !== null ? (v as Partial<PayrollBase>) : {};
  return { ...DEFAULT_BASE, ...o, 직책수당: { ...DEFAULT_BASE.직책수당, ...(o.직책수당 ?? {}) } };
}

/** 명세서 입력값 검사. 잘못되면 오류 문구 */
export function validateEarnings(v: unknown): Earnings | string {
  if (typeof v !== "object" || v === null) return "지급내역이 올바르지 않습니다";
  const o = v as Record<string, unknown>;
  for (const k of EARNING_KEYS) if (!isAmount(o[k])) return `${k}은(는) 0 이상의 정수로 입력하세요`;
  return Object.fromEntries(EARNING_KEYS.map((k) => [k, o[k] as number])) as Earnings;
}

export function isValidAmount(v: unknown): v is number {
  return isAmount(v);
}

export function formatWon(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("ko-KR");
}

/** "2026-09" → "2026년 09월" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${m}월`;
}

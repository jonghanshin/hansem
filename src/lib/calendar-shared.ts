// 팀 캘린더: 서버·브라우저에서 함께 쓰는 타입과 날짜 계산.
// 날짜는 시간대 문제를 피하려고 "YYYY-MM-DD" 문자열로만 다루고, 계산은 UTC 기준 Date로 한다.

export type CalendarMember = { id: number; name: string };

export type CalendarEvent = {
  id: number;
  ownerId: number;
  title: string;
  memo: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM, null이면 종일
  endTime: string | null;
  /** true면 공용 일정: 모든 사람에게 보인다 */
  shared: boolean;
  /** 개인 일정: 직접 고른 색 (EVENT_COLORS 키, null이면 사람별 기본 색) / 공용 일정: Team 분류 (TEAM_CATEGORIES 키) */
  color: string | null;
  /** 고객상담에서 자동 등록된 일정이면 그 상담 id (캘린더에서는 고칠 수 없고 상담노트에서 바꾼다) */
  consultId: number | null;
};

export const EVENT_KIND_PERSONAL = "개인";
export const EVENT_KIND_SHARED = "공용";

export const EVENT_TITLE_MAX = 100;
export const EVENT_MEMO_MAX = 2000;
/** 한 번에 같이 볼 수 있는 다른 팀원 수 */
export const MAX_SELECTED_MEMBERS = 20;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YM_RE = /^(\d{4})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n: number) => String(n).padStart(2, "0");

function toDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return toDateString(d) === s;
}

export function isValidTime(s: string): boolean {
  return TIME_RE.test(s);
}

/** "2026-11" 형식이면 그대로, 아니면 null */
export function parseYearMonth(s: string | undefined): string | null {
  if (!s) return null;
  const m = YM_RE.exec(s);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 2000 || +m[1] > 2100) return null;
  return s;
}

/** ym에서 delta개월 이동 */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 해당 월 달력에 보이는 주 목록 (일요일 시작, 앞뒤 달 날짜 포함) */
export function monthWeeks(ym: string): string[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const weekCount = Math.ceil((lead + daysInMonth) / 7);
  const weeks: string[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toDateString(new Date(Date.UTC(y, m - 1, 1 - lead + w * 7 + i))));
    }
    weeks.push(week);
  }
  return weeks;
}

/** 달력에 보이는 첫날·마지막날 */
export function monthRange(ym: string): { from: string; to: string } {
  const weeks = monthWeeks(ym);
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] };
}

/** 오늘 날짜 (한국 시간) */
export function todayInKorea(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 그 날짜에 걸쳐 있는 일정인지 */
export function eventOnDate(e: CalendarEvent, date: string): boolean {
  return e.startDate <= date && date <= e.endDate;
}

/** 하루 안 정렬: 공용 일정 먼저, 그다음 종일·여러 날 일정, 그다음 시작시간 순 */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.shared !== b.shared) return a.shared ? -1 : 1;
  const aAllDay = a.startTime === null || a.startDate !== a.endDate;
  const bAllDay = b.startTime === null || b.startDate !== b.endDate;
  if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
  return (
    a.startDate.localeCompare(b.startDate) ||
    (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
    a.id - b.id
  );
}

export function formatEventPeriod(e: CalendarEvent): string {
  const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const time = e.startTime ? ` ${e.startTime}${e.endTime ? `~${e.endTime}` : ""}` : " 종일";
  if (e.startDate === e.endDate) return `${md(e.startDate)}${time}`;
  return `${md(e.startDate)} ~ ${md(e.endDate)}${e.startTime ? time : ""}`;
}

// ---------- 사람별 색상 ----------
// Tailwind가 클래스를 찾을 수 있도록 전체 문자열로 적는다.

export type MemberColor = { chip: string; dot: string };

/** 공용 일정 색 (누가 등록했든 같은 색) — Team 분류 '기타' */
export const SHARED_COLOR: MemberColor = { chip: "bg-zinc-800 text-white border-l-red-500", dot: "bg-zinc-800" };

/** Team(공용) 일정 분류. 공용 일정은 '일정.색상' 컬럼에 이 키를 저장하고, 분류별 색으로 보인다 */
export const TEAM_CATEGORIES = {
  휴무: { chip: "bg-orange-500 text-white border-l-orange-800", dot: "bg-orange-500" },
  한샘근무: { chip: "bg-indigo-600 text-white border-l-indigo-900", dot: "bg-indigo-600" },
  기타: SHARED_COLOR,
} satisfies Record<string, MemberColor>;

export type TeamCategory = keyof typeof TEAM_CATEGORIES;
export const TEAM_CATEGORY_KEYS = Object.keys(TEAM_CATEGORIES) as TeamCategory[];
export const TEAM_CATEGORY_DEFAULT: TeamCategory = "기타";

export function isTeamCategory(v: unknown): v is TeamCategory {
  return typeof v === "string" && Object.hasOwn(TEAM_CATEGORIES, v);
}

/** 공용 일정의 분류 (예전 일정처럼 값이 없으면 '기타') */
export function teamCategoryOf(e: CalendarEvent): TeamCategory {
  return isTeamCategory(e.color) ? e.color : TEAM_CATEGORY_DEFAULT;
}

/** 본인 일정 색 */
export const MY_COLOR: MemberColor = { chip: "bg-blue-100 text-blue-900 border-l-blue-500", dot: "bg-blue-500" };

/** 개인 일정에 직접 고를 수 있는 색. 키는 '일정.색상' 컬럼에 저장된다 */
export const EVENT_COLORS = {
  blue: { label: "파랑", ...MY_COLOR },
  emerald: { label: "초록", chip: "bg-emerald-100 text-emerald-900 border-l-emerald-500", dot: "bg-emerald-500" },
  amber: { label: "노랑", chip: "bg-amber-100 text-amber-900 border-l-amber-500", dot: "bg-amber-500" },
  rose: { label: "빨강", chip: "bg-rose-100 text-rose-900 border-l-rose-500", dot: "bg-rose-500" },
  violet: { label: "보라", chip: "bg-violet-100 text-violet-900 border-l-violet-500", dot: "bg-violet-500" },
  cyan: { label: "하늘", chip: "bg-cyan-100 text-cyan-900 border-l-cyan-500", dot: "bg-cyan-500" },
  orange: { label: "주황", chip: "bg-orange-100 text-orange-900 border-l-orange-500", dot: "bg-orange-500" },
  lime: { label: "연두", chip: "bg-lime-100 text-lime-900 border-l-lime-600", dot: "bg-lime-600" },
  fuchsia: { label: "분홍", chip: "bg-fuchsia-100 text-fuchsia-900 border-l-fuchsia-500", dot: "bg-fuchsia-500" },
  teal: { label: "청록", chip: "bg-teal-100 text-teal-900 border-l-teal-500", dot: "bg-teal-500" },
  stone: { label: "회색", chip: "bg-stone-200 text-stone-900 border-l-stone-500", dot: "bg-stone-500" },
} satisfies Record<string, MemberColor & { label: string }>;

export type EventColorKey = keyof typeof EVENT_COLORS;

export function isEventColor(v: unknown): v is EventColorKey {
  return typeof v === "string" && Object.hasOwn(EVENT_COLORS, v);
}

/** 사람별 기본 색 (본인 파랑 제외) */
const PALETTE: MemberColor[] = Object.entries(EVENT_COLORS)
  .filter(([k]) => k !== "blue")
  .map(([, c]) => c);

/** 팀원 목록 순서로 색을 정해, 누구를 함께 선택하든 같은 사람은 늘 같은 색 */
export function memberColors(meId: number, members: CalendarMember[]): Map<number, MemberColor> {
  const colors = new Map<number, MemberColor>([[meId, MY_COLOR]]);
  members
    .filter((m) => m.id !== meId)
    .forEach((m, i) => colors.set(m.id, PALETTE[i % PALETTE.length]));
  return colors;
}

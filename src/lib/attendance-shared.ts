// 근태관리: 서버·브라우저 공용 상수와 타입

/** 출근예정: 퇴근할 때 정하는 내일 출근 예정지 (근무일 = 다음 날) */
export const ATTENDANCE_KINDS = ["출근", "퇴근", "출근예정"] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

/** 장소 선택지. 현장은 진행 중인 내 현장을, 기타는 직접 입력을 추가로 받는다 */
export const PLACE_OPTIONS = [
  { value: "죽전사무실", label: "죽전사무실" },
  { value: "죽전스타필드", label: "죽전스타필드" },
  { value: "현장", label: "현장" },
  { value: "기타", label: "기타" },
] as const;
export type PlaceType = (typeof PLACE_OPTIONS)[number]["value"];

export const PLACE_MEMO_MAX = 100;

export function isAttendanceKind(v: unknown): v is AttendanceKind {
  return typeof v === "string" && (ATTENDANCE_KINDS as readonly string[]).includes(v);
}

export function isPlaceType(v: unknown): v is PlaceType {
  return typeof v === "string" && PLACE_OPTIONS.some((o) => o.value === v);
}

export type AttendanceRecord = {
  id: number;
  구분: AttendanceKind;
  장소구분: PlaceType;
  장소: string;
  현장번호: string | null;
  근무일: string;
  기록일시: string;
};

/** 진행 중인 내 현장 (현장 출근·퇴근 선택용) */
export type MySiteOption = { 현장번호: string; 고객명: string | null; 현장주소: string | null };

/** 기록일시 → 한국 시각 HH:MM */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** YYYY-MM-DD에 n일을 더한다 */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v;
}

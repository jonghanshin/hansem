// A/S 관리: 서버·브라우저에서 함께 쓰는 타입·선택값·규칙.
// 선택값과 '확인 사항' 규칙은 doc/A_S관리노트.xlsx('입력안내' 시트, 'AS 관리대장' X열 수식)와 같다.

import { VENDOR_INFO_COLUMNS, type VendorInfo } from "@/lib/deposits";

/** 협력업체 거래처 정보 → 목록·검색용 요약 (업체 / 담당자 / 연락처, 업체가 없으면 공정) */
export function vendorSummary(info: VendorInfo | null | undefined): string {
  if (!info) return "";
  const name = info.업체.trim() || info.공정.trim();
  return [name, info.업체담당자성함.trim(), info.업체담당자연락처.trim()].filter(Boolean).join(" / ").slice(0, 300);
}

/** 저장된 JSON 값 → 거래처 정보 (항목이 하나도 없으면 null) */
export function toVendorInfo(raw: unknown): VendorInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const info = Object.fromEntries(
    VENDOR_INFO_COLUMNS.map((k) => [k, typeof o[k] === "string" ? (o[k] as string).trim().slice(0, 2000) : ""]),
  ) as VendorInfo;
  return info.공정 ? info : null;
}

export const AS_ROUTES = ["전화", "문자", "카카오톡", "현장", "이메일", "기타"] as const;
export const AS_TRADES = [
  "도배",
  "바닥",
  "필름",
  "목공·도어",
  "주방·가구",
  "욕실·타일",
  "창호",
  "전기·조명",
  "설비·누수",
  "냉난방·환기",
  "기타",
] as const;
/** 공종은 여러 개를 고를 수 있고 "주방·가구, 설비·누수"처럼 쉼표로 이어 저장한다 */
export const TRADE_SEPARATOR = ", ";

export function tradesOf(value: string): string[] {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

/** 고른 공종을 목록 순서대로 이어 붙인다 (목록에 없는 값은 버린다) */
export function joinTrades(values: readonly string[]): string {
  return (AS_TRADES as readonly string[]).filter((t) => values.includes(t)).join(TRADE_SEPARATOR);
}

export const AS_URGENCIES = ["일반", "우선", "긴급"] as const;
export const AS_STATES = ["접수", "일정조율", "방문예정", "처리중", "자재대기", "처리완료", "보류", "취소"] as const;
export const AS_CUSTOMER_CHECKS = ["미확인", "확인예정", "확인완료", "추가조치요청"] as const;
export const AS_CHARGES = ["미정", "무상", "유상", "일부유상"] as const;
export const AS_RESULTS = ["해결", "일부해결", "재방문필요", "원인확인중"] as const;
export const AS_BILLING_STATES = ["미정", "미청구", "청구완료", "입금완료", "해당없음"] as const;
export const AS_PAY_STATES = ["미정", "처리 후 지급예정", "지급완료", "지급보류"] as const;
export const AS_HISTORY_KINDS = ["전화", "문자", "방문", "원격확인", "자재발주", "기타"] as const;
export const AS_CHECK_METHODS = ["전화", "문자", "현장확인", "사진확인", "기타"] as const;
export const AS_RECURRENCES = ["미확인", "재발없음", "재발있음"] as const;
export const AS_PHOTO_KINDS = ["접수", "완료", "증빙"] as const;

/** 무상 A/S 기간 (공사 완료일로부터) */
export const WARRANTY_YEARS = 1;

export type AsPhotoKind = (typeof AS_PHOTO_KINDS)[number];

export type AsPhoto = {
  name: string;
  stored: string;
  size: number;
  uploadedAt: string;
  by: string;
  kind: AsPhotoKind;
};

export type AsCase = {
  id: number;
  접수번호: string;
  현장번호: string | null;
  고객번호: string;
  고객명: string;
  연락처: string;
  현장주소: string;
  공사완료일: string | null;
  영업사원: string | null;
  영업사원ID: string | null;
  접수일: string;
  접수경로: string;
  담당자: string;
  /** 처리 협력업체 요약 (목록·검색용: 업체 / 담당자 / 연락처) */
  협력업체: string;
  /** 처리 협력업체 거래처 정보 (입금 등록의 거래처 정보와 같은 항목). 예전 접수는 없을 수 있다 */
  협력업체정보?: VendorInfo | null;
  공종: string;
  발생위치: string;
  발생일: string | null;
  긴급도: string;
  고객요청: string;
  증상: string;
  초기원인: string;
  방문예정일시: string | null; // YYYY-MM-DDTHH:MM
  처리기한: string | null;
  진행상태: string;
  최근안내일: string | null;
  유무상: string;
  협의일: string | null;
  처리계획: string;
  고객안내: string;
  유무상근거: string;
  처리완료일: string | null;
  고객확인: string;
  고객확인일: string | null;
  확인방법: string;
  처리결과: string;
  재발여부: string;
  최종조치: string;
  추가요청: string;
  추적계획: string;
  자재비: number | null;
  인건비: number | null;
  기타비용: number | null;
  비용메모: string;
  고객청구액: number | null;
  정산상태: string;
  지급상태: string;
  원접수id: number | null;
  사진: AsPhoto[];
  등록자: number | null;
  등록일시: string;
  수정일시: string | null;
};

export type AsHistory = {
  id: number;
  접수id: number;
  일시: string; // YYYY-MM-DDTHH:MM
  구분: string;
  업체: string;
  내용: string;
  결과: string;
  작성자: string;
  등록자: number | null;
};

/** 접수 화면의 현장 검색 결과 */
export type AsSiteHit = {
  현장번호: string;
  고객명: string;
  연락처: string;
  현장주소: string;
  공사완료일: string | null;
  영업사원: string | null;
  영업사원ID: string | null;
  고객번호: string;
  /** 이 현장의 이전 A/S */
  previous: { id: number; 접수번호: string; 접수일: string; 공종: string; 고객요청: string; 진행상태: string }[];
};

/** A/S 담당자로 고를 수 있는 사람 (권한 테이블) */
export type AsMember = { 이름: string; 역할: string };

// ---------- 확인 사항 (엑셀 'AS 관리대장' X열과 같은 규칙) ----------

export type AsCheck =
  | "취소"
  | "보류"
  | "종결"
  | "완료일 확인"
  | "고객확인 필요"
  | "진행상태 확인"
  | "기한 경과"
  | "일정 미등록"
  | "처리 예정";

export function asCheckOf(c: AsCase, today: string): AsCheck {
  if (c.진행상태 === "취소") return "취소";
  const done = c.진행상태 === "처리완료";
  const confirmed = c.고객확인 === "확인완료" && !!c.고객확인일;
  if (done && c.처리완료일 && confirmed) return "종결";
  if (done && !c.처리완료일) return "완료일 확인";
  if ((done || c.처리완료일) && !confirmed) return "고객확인 필요";
  if (c.처리완료일) return "진행상태 확인";
  // 보류는 엑셀 규칙에 없지만 '일정 미등록'으로 계속 경고가 뜨지 않게 따로 표시
  if (c.진행상태 === "보류") return "보류";
  if (c.처리기한 && c.처리기한 < today) return "기한 경과";
  if (!c.처리기한 && !c.방문예정일시) return "일정 미등록";
  return "처리 예정";
}

/** 종결·취소가 아니면 진행 중 */
export function isOpenCheck(check: AsCheck): boolean {
  return check !== "종결" && check !== "취소";
}

export function checkBadge(check: AsCheck): string {
  switch (check) {
    case "종결":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "취소":
    case "보류":
      return "bg-zinc-100 text-zinc-600 ring-zinc-200";
    case "처리 예정":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "기한 경과":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-amber-50 text-amber-800 ring-amber-200";
  }
}

export function urgencyBadge(u: string): string {
  return u === "긴급" ? "bg-red-600 text-white" : u === "우선" ? "bg-orange-100 text-orange-800" : "";
}

// ---------- 무상 A/S 기간 ----------

/** 무상 기간 마지막 날 (공사 완료일 + 1년 - 1일) */
export function warrantyEnd(completed: string | null): string | null {
  const m = completed && /^(\d{4})-(\d{2})-(\d{2})$/.exec(completed);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1] + WARRANTY_YEARS, +m[2] - 1, +m[3] - 1));
  return d.toISOString().slice(0, 10);
}

/** 기준일(보통 접수일)에 무상 기간인지와 남은/지난 일수 */
export function warrantyInfo(completed: string | null, on: string): { end: string; inWarranty: boolean; days: number } | null {
  const end = warrantyEnd(completed);
  if (!end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(on)) / 86_400_000);
  return { end, inWarranty: days >= 0, days };
}

export function costTotal(c: Pick<AsCase, "자재비" | "인건비" | "기타비용">): number | null {
  const parts = [c.자재비, c.인건비, c.기타비용];
  return parts.every((v) => v === null) ? null : parts.reduce<number>((s, v) => s + (v ?? 0), 0);
}

// ---------- 파일 ----------

export const AS_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const AS_FILES_MAX = 40;
export const AS_STORED_NAME_RE = /^\d{10,16}-[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/;

export function asFileUrl(id: number, stored: string): string {
  return `/as/${id}/files/${encodeURIComponent(stored)}`;
}

export const AS_TEXT_MAX = 200;
export const AS_LONG_TEXT_MAX = 3000;

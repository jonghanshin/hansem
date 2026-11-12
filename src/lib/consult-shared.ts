// 고객상담(상담노트): 서버·브라우저에서 함께 쓰는 타입과 선택값.
// 선택값은 doc/상담노트.xlsx '상담노트 서식' 시트의 드롭다운과 같다.

export const MEETING_PLACES = ["홈씨씨매장", "한샘전시매장", "죽전사무실", "언남동사무실", "고객 현장", "전화·온라인", "기타"] as const;
export const STAGES = [
  "상담접수",
  "상담진행",
  "실측예정",
  "견적작성",
  "견적전달",
  "계약협의",
  "계약완료",
  "시공중",
  "시공완료",
  "보류",
  "계약취소",
] as const;
export const CONSULT_KINDS = ["최초상담", "후속상담", "견적상담", "계약상담"] as const;
export const CONTACT_STATES = ["미연락", "연락완료", "부재중", "재연락필요", "답변대기"] as const;
export const CONTACT_METHODS = ["전화", "문자", "카카오톡", "방문", "기타"] as const;
export const VISIT_STATES = ["미정", "예정", "완료", "취소", "재조율"] as const;
export const PRIORITIES = ["필수", "검토", "제외"] as const;
export const ESTIMATE_INCLUDES = ["미정", "포함", "제외"] as const;
export const TODO_STATES = ["미착수", "진행중", "완료", "보류"] as const;
/** 금액 구분 입력 도움말 (직접 입력도 가능) */
export const AMOUNT_KINDS = ["최소 예상금액 이상", "예상금액", "확정견적"] as const;
/** 희망 공사 기본 항목 (엑셀 서식의 기본 9개) */
export const DEFAULT_WORKS = [
  "도배",
  "바닥 공사",
  "필름 공사",
  "문틀 및 걸레받이",
  "주방 공사",
  "욕실 공사",
  "냉난방 공사",
  "실링팬 설치",
  "도어 공사",
] as const;

export type Stage = (typeof STAGES)[number];

/** 목록 탭: 진행단계 묶음 */
export const STAGE_TABS = [
  { key: "active", label: "진행중", stages: ["상담접수", "상담진행", "실측예정", "견적작성", "견적전달", "계약협의"] },
  { key: "consult", label: "상담", stages: ["상담접수", "상담진행"] },
  { key: "estimate", label: "실측·견적", stages: ["실측예정", "견적작성", "견적전달"] },
  { key: "deal", label: "계약협의", stages: ["계약협의"] },
  { key: "won", label: "계약·시공", stages: ["계약완료", "시공중", "시공완료"] },
  { key: "hold", label: "보류·취소", stages: ["보류", "계약취소"] },
  { key: "all", label: "전체", stages: [...STAGES] },
] as const satisfies readonly { key: string; label: string; stages: readonly Stage[] }[];

export type StageTabKey = (typeof STAGE_TABS)[number]["key"];

/** 진행단계 배지 색 */
export function stageBadge(stage: string): string {
  if (stage === "상담접수" || stage === "상담진행") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (stage === "실측예정" || stage === "견적작성" || stage === "견적전달") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (stage === "계약협의") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (stage === "계약완료" || stage === "시공중" || stage === "시공완료") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
}

/** 진행 중인 상담인지 (연락 지연 경고 대상) */
export function isActiveStage(stage: string): boolean {
  return (STAGE_TABS[0].stages as readonly string[]).includes(stage);
}

export type WorkItem = { 항목: string; 상세: string; 우선순위: string; 견적반영: string };
export type TodoItem = { 내용: string; 담당자: string; 예정일: string; 상태: string };

export type Consult = {
  id: number;
  고객번호: string;
  고객명: string;
  연락처: string;
  만난장소: string;
  매장지점: string;
  현장주소: string;
  평형: number | null;
  주택유형: string;
  예산: number | null;
  영업사원: string | null;
  영업사원ID: string | null;
  상담일: string; // YYYY-MM-DD
  시공예정월: string; // YYYY-MM
  진행단계: string;
  상담구분: string;
  연락상태: string;
  최근연락일: string | null;
  다음연락일: string | null;
  연락방법: string;
  다음미팅일시: string | null; // YYYY-MM-DDTHH:MM
  미팅장소: string;
  미팅상태: string;
  실측일시: string | null;
  실측상태: string;
  일정메모: string;
  공사항목: WorkItem[];
  전체공사: number | null;
  금액구분: string;
  예산별제안: string;
  견적자재안내: string;
  상담핵심: string;
  할일: TodoItem[];
  첨부: ConsultFile[];
  현장번호: string | null;
  등록일시: string;
  수정일시: string | null;
};

export type ConsultRecord = {
  id: number;
  상담id: number;
  기록일시: string; // YYYY-MM-DDTHH:MM
  연락방법: string;
  담당자: string;
  내용: string;
  등록자: number | null;
};

/** 상담노트 첨부파일 ('상담.첨부' jsonb 목록. 실제 파일은 upload/consult/<stored>) */
export type ConsultFile = {
  /** 사용자가 올린 원래 파일 이름 */
  name: string;
  /** upload/consult/ 아래 실제 저장 이름 */
  stored: string;
  size: number;
  uploadedAt: string;
  /** 올린 사람 이름 */
  by: string;
};

export const CONSULT_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const CONSULT_FILES_MAX = 30;
/** 저장 이름 형식: 1731400000000-uuid.ext */
export const CONSULT_STORED_NAME_RE = /^\d{10,16}-[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/;

export function consultFileUrl(consultId: number, stored: string): string {
  return `/consult/${consultId}/files/${encodeURIComponent(stored)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ---------- 오늘 할 일 ----------

export type AgendaKind = "연락" | "미팅" | "실측" | "할일";
export type AgendaItem = { kind: AgendaKind; label: string; when: string; overdue: boolean };

/**
 * 오늘 챙길 일: 다음 연락일이 오늘·지남, 오늘 미팅·실측, 예정일이 오늘·지난 할 일.
 * 보류·계약취소 상담은 뺀다.
 */
export function consultAgenda(
  c: Pick<Consult, "진행단계" | "다음연락일" | "다음미팅일시" | "미팅상태" | "실측일시" | "실측상태" | "할일">,
  today: string,
): AgendaItem[] {
  if (c.진행단계 === "보류" || c.진행단계 === "계약취소") return [];
  const items: AgendaItem[] = [];
  if (isActiveStage(c.진행단계) && c.다음연락일 && c.다음연락일 <= today) {
    items.push({ kind: "연락", label: "연락", when: c.다음연락일, overdue: c.다음연락일 < today });
  }
  const visit = (kind: "미팅" | "실측", at: string | null, state: string) => {
    if (at && at.slice(0, 10) === today && state !== "완료" && state !== "취소") {
      items.push({ kind, label: kind, when: at, overdue: false });
    }
  };
  visit("미팅", c.다음미팅일시, c.미팅상태);
  visit("실측", c.실측일시, c.실측상태);
  for (const t of c.할일) {
    if (t.예정일 && t.예정일 <= today && t.상태 !== "완료" && t.상태 !== "보류") {
      items.push({ kind: "할일", label: t.내용, when: t.예정일, overdue: t.예정일 < today });
    }
  }
  return items;
}

/** 담당 RD로 고를 수 있는 사람 */
export type ConsultMember = { 영업사원ID: string; 이름: string; 역할: string };

export const TEXT_MAX = 200;
export const LONG_TEXT_MAX = 3000;
export const WORK_ITEMS_MAX = 40;
export const TODO_ITEMS_MAX = 40;

/** "2026-11-14T14:00" → "11/14(금) 14:00" */
export function formatDateTime(v: string | null): string {
  if (!v) return "";
  const d = v.slice(0, 10);
  const t = v.slice(11, 16);
  return `${formatDate(d)}${t ? ` ${t}` : ""}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-14" → "11/14(금)" */
export function formatDate(v: string | null): string {
  if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v ?? "";
  const wd = WEEKDAYS[new Date(`${v.slice(0, 10)}T00:00:00Z`).getUTCDay()];
  return `${+v.slice(5, 7)}/${+v.slice(8, 10)}(${wd})`;
}

/** "2027-03" → "2027년 3월" */
export function formatYearMonth(v: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? `${m[1]}년 ${+m[2]}월` : v;
}

/** 만원 단위 금액 표시 */
export function formatManwon(v: number | null): string {
  return v === null ? "" : `${v.toLocaleString("ko-KR")}만원`;
}

/** 기기 기준 지금 (datetime-local 입력값 형식) */
export function nowLocalInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

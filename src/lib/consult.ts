import "server-only";

// 고객상담(상담노트): 상담은 Supabase '상담' 테이블, 연락 기록은 '상담기록' 테이블.
// RD는 담당 RD('영업사원')가 본인인 상담만, 관리자 이상은 모든 상담을 보고 고친다.
// 열외 계정이 담당이거나 등록한 상담·기록은 열외가 아닌 사용자에게 보이지 않는다.

import { CLOSED_STAGES, type Consult, type ConsultFile, type ConsultMember, type ConsultRecord, type TodoItem, type WorkItem } from "@/lib/consult-shared";
import type { Exclusion } from "@/lib/excluded-users";
import { fetchAuthDirectory } from "@/lib/auth-directory";
import { CONSULT_RECORDS_TABLE, CONSULT_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

/** 저장할 수 있는 상담 컬럼 (id·고객번호·등록 정보 제외) */
export type ConsultInput = Omit<Consult, "id" | "고객번호" | "등록일시" | "수정일시" | "현장번호" | "첨부">;

export type ConsultRecordInput = { 기록일시: string; 연락방법: string; 내용: string };

const RECORD_COLUMNS = "id, 상담id, 기록일시, 연락방법, 담당자, 내용, 등록자";

function tableError(label: string, message: string): Error {
  if (/schema cache|does not exist/i.test(message)) {
    return new Error(`${label} 실패: 상담 테이블(또는 컬럼)이 없습니다. doc/상담노트.sql과 doc/상담노트_2단계.sql을 Supabase SQL Editor에서 실행해 주세요.`);
  }
  return new Error(`${label} 실패: ${message}`);
}

/** Postgres timestamp("2026-11-14T14:00:00") → "2026-11-14T14:00" */
function minutes(v: string | null): string | null {
  return v ? v.replace(" ", "T").slice(0, 16) : null;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function toConsult(r: Record<string, unknown>): Consult {
  const c = r as unknown as Consult;
  return {
    ...c,
    평형: r.평형 === null || r.평형 === undefined ? null : Number(r.평형),
    다음미팅일시: minutes(c.다음미팅일시),
    실측일시: minutes(c.실측일시),
    공사항목: asArray<WorkItem>(r.공사항목),
    할일: asArray<TodoItem>(r.할일),
    첨부: asArray<ConsultFile>(r.첨부),
  };
}

/** 상담을 보는 사람의 범위: 숨길 열외 계정 + salesName(RD면 본인 이름, 관리자 이상은 null = 전체) */
export type ConsultView = Exclusion & { salesName: string | null };

/** 볼 수 없는 상담인지: RD의 담당이 아닌 상담, 열외 계정이 담당이거나 등록한 상담 */
function hiddenConsult(r: Record<string, unknown>, view: ConsultView): boolean {
  const exclusion = view;
  if (view.salesName !== null && r.영업사원 !== view.salesName) return true;
  return (
    (typeof r.영업사원 === "string" && exclusion.names.includes(r.영업사원)) ||
    (typeof r.등록자 === "number" && exclusion.ids.includes(r.등록자))
  );
}

/** 상담 전체 (최근 상담일 순) */
export async function fetchConsults(view: ConsultView): Promise<Consult[]> {
  let query = getSupabaseAdmin().from(CONSULT_TABLE).select("*");
  // RD는 본인 담당만 DB에서 바로 거른다 (열외 조건은 아래에서 한 번 더 확인)
  if (view.salesName !== null) query = query.eq("영업사원", view.salesName);
  const { data, error } = await query
    .order("상담일", { ascending: false })
    .order("id", { ascending: false })
    .limit(1000);
  if (error) throw tableError("상담 목록 조회", error.message);
  return ((data ?? []) as Record<string, unknown>[]).filter((r) => !hiddenConsult(r, view)).map(toConsult);
}

/** 오늘 할 일 알림용: 진행 중인 상담의 일정·할 일 칼럼만 (메뉴 바에서 페이지마다 읽으므로 가볍게) */
export type ConsultAgendaRow = Pick<
  Consult,
  "id" | "고객명" | "진행단계" | "다음연락일" | "다음미팅일시" | "미팅상태" | "실측일시" | "실측상태" | "할일"
>;

export async function fetchConsultAgendaRows(view: ConsultView): Promise<ConsultAgendaRow[]> {
  let query = getSupabaseAdmin()
    .from(CONSULT_TABLE)
    .select("id, 고객명, 영업사원, 등록자, 진행단계, 다음연락일, 다음미팅일시, 미팅상태, 실측일시, 실측상태, 할일")
    .not("진행단계", "in", `(${CLOSED_STAGES.map((s) => `"${s}"`).join(",")})`);
  if (view.salesName !== null) query = query.eq("영업사원", view.salesName);
  const { data, error } = await query.limit(2000);
  if (error) throw tableError("오늘 할 일 조회", error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((r) => !hiddenConsult(r, view))
    .map((r) => {
      const c = r as unknown as ConsultAgendaRow;
      return { ...c, 다음미팅일시: minutes(c.다음미팅일시), 실측일시: minutes(c.실측일시), 할일: Array.isArray(r.할일) ? (r.할일 as TodoItem[]) : [] };
    });
}

/** 상담 한 건 (없거나 볼 수 없는 상담이면 null) */
export async function fetchConsult(id: number, view: ConsultView): Promise<Consult | null> {
  const { data, error } = await getSupabaseAdmin().from(CONSULT_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw tableError("상담 조회", error.message);
  const row = data as Record<string, unknown> | null;
  return row && !hiddenConsult(row, view) ? toConsult(row) : null;
}

/** 상담의 연락 기록 (열외 계정이 남긴 기록은 뺀다) */
export async function fetchConsultRecords(consultId: number, exclusion: Exclusion): Promise<ConsultRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(CONSULT_RECORDS_TABLE)
    .select(RECORD_COLUMNS)
    .eq("상담id", consultId)
    .order("기록일시", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw tableError("상담 기록 조회", error.message);
  return ((data ?? []) as unknown as ConsultRecord[])
    .filter((r) => r.등록자 === null || !exclusion.ids.includes(r.등록자))
    .map((r) => ({ ...r, 기록일시: minutes(r.기록일시) ?? "" }));
}

/** 담당 RD로 고를 수 있는 사람 (권한 테이블, RD 먼저 이름순). 열외 계정은 뺀다 */
export async function fetchConsultMembers(exclusion: Exclusion): Promise<ConsultMember[]> {
  return (await fetchAuthDirectory())
    .filter((r) => !exclusion.ids.includes(r.id))
    .map((r) => ({ 영업사원ID: r.영업사원ID, 이름: r.이름, 역할: r.역할 }))
    .sort((a, b) => Number(b.역할 === "RD") - Number(a.역할 === "RD") || a.이름.localeCompare(b.이름, "ko"));
}

/** 상담일 "2026-10-30" → 고객번호 앞부분 "2026-1030-" */
function customerNoPrefix(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-`;
}

async function nextCustomerNo(date: string): Promise<string> {
  const prefix = customerNoPrefix(date);
  const { data, error } = await getSupabaseAdmin().from(CONSULT_TABLE).select("고객번호").like("고객번호", `${prefix}%`);
  if (error) throw tableError("고객번호 생성", error.message);
  const max = ((data ?? []) as unknown as { 고객번호: string }[]).reduce((m, r) => {
    const n = Number(r.고객번호.slice(prefix.length));
    return Number.isSafeInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${max + 1}`;
}

/** 새 상담 등록. 고객번호는 상담일 기준으로 자동 생성 (동시에 등록해 겹치면 다시 시도) */
export async function insertConsult(input: ConsultInput, uid: number): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const 고객번호 = await nextCustomerNo(input.상담일);
    const { data, error } = await getSupabaseAdmin()
      .from(CONSULT_TABLE)
      .insert({ ...input, 고객번호, 등록자: uid })
      .select("id")
      .single();
    if (!error) return (data as { id: number }).id;
    if (error.code !== "23505") throw tableError("상담 등록", error.message);
  }
  throw new Error("상담 등록 실패: 고객번호가 겹쳤습니다. 다시 저장해 주세요.");
}

export async function updateConsult(id: number, input: Partial<ConsultInput>): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(CONSULT_TABLE)
    .update({ ...input, 수정일시: new Date().toISOString() })
    .eq("id", id);
  if (error) throw tableError("상담 수정", error.message);
}

/** 첨부파일 목록 저장 */
export async function setConsultFiles(id: number, files: ConsultFile[]): Promise<void> {
  const { error } = await getSupabaseAdmin().from(CONSULT_TABLE).update({ 첨부: files }).eq("id", id);
  if (error) throw tableError("첨부파일 저장", error.message);
}

/** 현장으로 전환: 현장번호 연결 + 진행단계 */
export async function linkConsultSite(id: number, 현장번호: string, 진행단계: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(CONSULT_TABLE)
    .update({ 현장번호, 진행단계, 수정일시: new Date().toISOString() })
    .eq("id", id);
  if (error) throw tableError("현장 연결", error.message);
}

/** 현장번호 → 연결된 상담 id (현장정보 화면의 '상담노트 보기'용). 볼 수 있는 상담만 */
export async function fetchConsultIdsBySite(view: ConsultView): Promise<Record<string, number>> {
  const { data, error } = await getSupabaseAdmin()
    .from(CONSULT_TABLE)
    .select("id, 현장번호, 영업사원, 등록자")
    .not("현장번호", "is", null);
  if (error) throw tableError("상담 연결 조회", error.message);
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    if (!hiddenConsult(r, view) && typeof r.현장번호 === "string") map[r.현장번호] = r.id as number;
  }
  return map;
}

export async function deleteConsult(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from(CONSULT_TABLE).delete().eq("id", id);
  if (error) throw tableError("상담 삭제", error.message);
}

export async function insertConsultRecord(
  consultId: number,
  input: ConsultRecordInput,
  author: { uid: number; name: string },
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(CONSULT_RECORDS_TABLE)
    .insert({ ...input, 상담id: consultId, 담당자: author.name, 등록자: author.uid });
  if (error) throw tableError("상담 기록 등록", error.message);
}

export async function fetchConsultRecord(id: number): Promise<ConsultRecord | null> {
  const { data, error } = await getSupabaseAdmin().from(CONSULT_RECORDS_TABLE).select(RECORD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw tableError("상담 기록 조회", error.message);
  return data as unknown as ConsultRecord | null;
}

export async function deleteConsultRecord(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from(CONSULT_RECORDS_TABLE).delete().eq("id", id);
  if (error) throw tableError("상담 기록 삭제", error.message);
}

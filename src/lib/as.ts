import "server-only";

// A/S 관리: 접수는 Supabase 'AS접수' 테이블, 방문·처리 이력은 'AS이력' 테이블.
// RD는 담당 RD('영업사원')가 본인인 A/S만, 관리자 이상은 모든 A/S를 본다.
// 열외 계정이 담당 RD이거나 등록한 A/S·이력은 열외가 아닌 사용자에게 보이지 않는다.

import type { AsCase, AsHistory, AsMember, AsPhoto, AsSiteHit } from "@/lib/as-shared";
import type { DataScope } from "@/lib/data-scope";
import type { Exclusion } from "@/lib/excluded-users";
import { fetchSites } from "@/lib/sites-data";
import { AS_HISTORY_TABLE, AS_TABLE, AUTH_TABLE, CONSULT_TABLE, getSupabaseAdmin } from "@/lib/supabase-admin";

/** 저장할 수 있는 A/S 컬럼 (id·접수번호·사진·등록 정보 제외) */
export type AsInput = Omit<AsCase, "id" | "접수번호" | "사진" | "등록자" | "등록일시" | "수정일시">;

export type AsHistoryInput = Pick<AsHistory, "일시" | "구분" | "업체" | "내용" | "결과">;

/** A/S를 보는 사람의 범위: 숨길 열외 계정 + salesName(RD면 본인 이름, 관리자 이상은 null = 전체) */
export type AsView = Exclusion & { salesName: string | null };

const HISTORY_COLUMNS = "id, 접수id, 일시, 구분, 업체, 내용, 결과, 작성자, 등록자";

function tableError(label: string, message: string): Error {
  if (/schema cache|does not exist/i.test(message)) {
    return new Error(`${label} 실패: A/S 테이블(또는 컬럼)이 없습니다. doc/AS관리.sql을 Supabase SQL Editor에서 실행해 주세요.`);
  }
  return new Error(`${label} 실패: ${message}`);
}

/** Postgres timestamp("2026-11-14T14:00:00") → "2026-11-14T14:00" */
function minutes(v: string | null): string | null {
  return v ? v.replace(" ", "T").slice(0, 16) : null;
}

function toCase(r: Record<string, unknown>): AsCase {
  const c = r as unknown as AsCase;
  return { ...c, 방문예정일시: minutes(c.방문예정일시), 사진: Array.isArray(r.사진) ? (r.사진 as AsPhoto[]) : [] };
}

/** 볼 수 없는 A/S인지: RD의 현장이 아닌 A/S, 열외 계정이 담당 RD이거나 등록한 A/S */
function hidden(r: Record<string, unknown>, view: AsView): boolean {
  if (view.salesName !== null && r.영업사원 !== view.salesName) return true;
  return (
    (typeof r.영업사원 === "string" && view.names.includes(r.영업사원)) ||
    (typeof r.등록자 === "number" && view.ids.includes(r.등록자))
  );
}

/** A/S 전체 (최근 접수 순) */
export async function fetchAsCases(view: AsView): Promise<AsCase[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(AS_TABLE)
    .select("*")
    .order("접수일", { ascending: false })
    .order("id", { ascending: false })
    .limit(2000);
  if (error) throw tableError("A/S 목록 조회", error.message);
  return ((data ?? []) as Record<string, unknown>[]).filter((r) => !hidden(r, view)).map(toCase);
}

/** A/S 한 건 (없거나 볼 수 없으면 null) */
export async function fetchAsCase(id: number, view: AsView): Promise<AsCase | null> {
  const { data, error } = await getSupabaseAdmin().from(AS_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw tableError("A/S 조회", error.message);
  const row = data as Record<string, unknown> | null;
  return row && !hidden(row, view) ? toCase(row) : null;
}

export async function fetchAsHistories(caseId: number, exclusion: Exclusion): Promise<AsHistory[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(AS_HISTORY_TABLE)
    .select(HISTORY_COLUMNS)
    .eq("접수id", caseId)
    .order("일시", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw tableError("A/S 이력 조회", error.message);
  return ((data ?? []) as unknown as AsHistory[])
    .filter((h) => h.등록자 === null || !exclusion.ids.includes(h.등록자))
    .map((h) => ({ ...h, 일시: minutes(h.일시) ?? "" }));
}

/** A/S 담당자로 고를 수 있는 사람 (관리자 역할 먼저, 이름순). 열외 계정은 뺀다 */
export async function fetchAsMembers(exclusion: Exclusion): Promise<AsMember[]> {
  const { data, error } = await getSupabaseAdmin().from(AUTH_TABLE).select("id, 영업사원ID, 이름, 역할");
  if (error) throw new Error(`담당자 목록 조회 실패: ${error.message}`);
  const rank = (role: string) => (role === "관리자" ? 0 : role === "RD" ? 2 : 1);
  return ((data ?? []) as unknown as { id: number; 영업사원ID: string; 이름: string | null; 역할: string | null }[])
    .filter((r) => !exclusion.ids.includes(r.id))
    .map((r) => ({ 이름: r.이름?.trim() || r.영업사원ID, 역할: r.역할?.trim() ?? "" }))
    .filter((m, i, all) => all.findIndex((x) => x.이름 === m.이름) === i)
    .sort((a, b) => rank(a.역할) - rank(b.역할) || a.이름.localeCompare(b.이름, "ko"));
}

/**
 * 접수 화면의 현장 검색: 현장번호·고객명·전화번호·주소 (볼 수 있는 현장만).
 * 고객상담에서 전환된 현장이면 고객번호, 그리고 이 현장의 이전 A/S를 함께 돌려준다.
 */
export async function searchAsSites(q: string, scope: DataScope, view: AsView): Promise<AsSiteHit[]> {
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  if (!term) return [];
  const sites = (await fetchSites(scope))
    .filter((s) => {
      const phone = (s.고객전화번호 ?? "").replace(/\D/g, "");
      return (
        (s.현장번호 ?? "").toLowerCase().includes(term) ||
        (s.고객명 ?? "").toLowerCase().includes(term) ||
        (s.현장주소 ?? "").toLowerCase().includes(term) ||
        (digits.length >= 4 && phone.includes(digits))
      );
    })
    .filter((s) => s.현장번호?.trim())
    .slice(0, 10);
  if (sites.length === 0) return [];
  const numbers = sites.map((s) => s.현장번호!.trim());

  const sb = getSupabaseAdmin();
  const [consults, previous] = await Promise.all([
    sb.from(CONSULT_TABLE).select("현장번호, 고객번호").in("현장번호", numbers),
    sb.from(AS_TABLE).select("*").in("현장번호", numbers).order("접수일", { ascending: false }),
  ]);
  // 상담 테이블이 없어도 검색은 된다 (고객번호만 비움)
  const customerNo = new Map(
    ((consults.data ?? []) as unknown as { 현장번호: string; 고객번호: string }[]).map((r) => [r.현장번호, r.고객번호]),
  );
  if (previous.error) throw tableError("이전 A/S 조회", previous.error.message);
  const prevRows = ((previous.data ?? []) as Record<string, unknown>[]).filter((r) => !hidden(r, view)).map(toCase);

  return sites.map((s) => {
    const no = s.현장번호!.trim();
    return {
      현장번호: no,
      고객명: s.고객명 ?? "",
      연락처: s.고객전화번호 ?? "",
      현장주소: s.현장주소 ?? "",
      공사완료일: s.완료일 ?? null,
      영업사원: s.영업사원 ?? null,
      영업사원ID: s.영업사원ID ?? null,
      고객번호: customerNo.get(no) ?? "",
      previous: prevRows
        .filter((c) => c.현장번호 === no)
        .map((c) => ({ id: c.id, 접수번호: c.접수번호, 접수일: c.접수일, 공종: c.공종, 고객요청: c.고객요청, 진행상태: c.진행상태 })),
    };
  });
}

/** 같은 고객의 다른 A/S (현장번호가 같거나, 직접 입력 고객이면 이름·연락처가 같은 것) */
export async function fetchRelatedAs(c: AsCase, view: AsView): Promise<AsCase[]> {
  const sb = getSupabaseAdmin().from(AS_TABLE).select("*").neq("id", c.id);
  const query = c.현장번호 ? sb.eq("현장번호", c.현장번호) : sb.eq("고객명", c.고객명).eq("연락처", c.연락처);
  const { data, error } = await query.order("접수일", { ascending: false }).limit(50);
  if (error) throw tableError("관련 A/S 조회", error.message);
  return ((data ?? []) as Record<string, unknown>[]).filter((r) => !hidden(r, view)).map(toCase);
}

/** 접수일 "2026-11-05" → 접수번호 앞부분 "AS-202611-" */
function asNoPrefix(date: string): string {
  return `AS-${date.slice(0, 4)}${date.slice(5, 7)}-`;
}

async function nextAsNo(date: string, taken: number): Promise<string> {
  const prefix = asNoPrefix(date);
  const { data, error } = await getSupabaseAdmin().from(AS_TABLE).select("접수번호").like("접수번호", `${prefix}%`);
  if (error) throw tableError("접수번호 생성", error.message);
  const max = ((data ?? []) as unknown as { 접수번호: string }[]).reduce((m, r) => {
    const n = Number(r.접수번호.slice(prefix.length));
    return Number.isSafeInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${max + 1 + taken}`;
}

/** 새 A/S 등록 (증상별로 여러 건). 접수번호는 접수일 기준 자동 생성 (겹치면 다시 시도) */
export async function insertAsCases(inputs: AsInput[], uid: number): Promise<number[]> {
  const ids: number[] = [];
  for (const input of inputs) {
    let inserted = false;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const 접수번호 = await nextAsNo(input.접수일, 0);
      const { data, error } = await getSupabaseAdmin()
        .from(AS_TABLE)
        .insert({ ...input, 접수번호, 등록자: uid })
        .select("id")
        .single();
      if (!error) {
        ids.push((data as { id: number }).id);
        inserted = true;
      } else if (error.code !== "23505") throw tableError("A/S 등록", error.message);
    }
    if (!inserted) throw new Error("A/S 등록 실패: 접수번호가 겹쳤습니다. 다시 저장해 주세요.");
  }
  return ids;
}

export async function updateAsCase(id: number, input: Partial<AsInput>): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(AS_TABLE)
    .update({ ...input, 수정일시: new Date().toISOString() })
    .eq("id", id);
  if (error) throw tableError("A/S 수정", error.message);
}

export async function setAsPhotos(id: number, photos: AsPhoto[]): Promise<void> {
  const { error } = await getSupabaseAdmin().from(AS_TABLE).update({ 사진: photos }).eq("id", id);
  if (error) throw tableError("사진 저장", error.message);
}

export async function deleteAsCase(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from(AS_TABLE).delete().eq("id", id);
  if (error) throw tableError("A/S 삭제", error.message);
}

export async function insertAsHistory(caseId: number, input: AsHistoryInput, author: { uid: number; name: string }): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(AS_HISTORY_TABLE)
    .insert({ ...input, 접수id: caseId, 작성자: author.name, 등록자: author.uid });
  if (error) throw tableError("A/S 이력 등록", error.message);
}

export async function fetchAsHistory(id: number): Promise<AsHistory | null> {
  const { data, error } = await getSupabaseAdmin().from(AS_HISTORY_TABLE).select(HISTORY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw tableError("A/S 이력 조회", error.message);
  return data as unknown as AsHistory | null;
}

export async function deleteAsHistory(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from(AS_HISTORY_TABLE).delete().eq("id", id);
  if (error) throw tableError("A/S 이력 삭제", error.message);
}

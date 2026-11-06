import "server-only";

import {
  KNOWLEDGE_TABLES,
  type KnowledgeInput,
  type KnowledgeRow,
  type KnowledgeTableKey,
  type VendorPickerData,
} from "@/lib/knowledge-shared";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_ROWS = 5000;

function tableError(label: string, table: string, message: string): Error {
  if (/schema cache|does not exist/i.test(message)) {
    return new Error(`${label} 실패: '${table}' 테이블을 찾을 수 없습니다.`);
  }
  return new Error(`${label} 실패: ${message}`);
}

export async function fetchKnowledgeRows(key: KnowledgeTableKey): Promise<KnowledgeRow[]> {
  const cfg = KNOWLEDGE_TABLES[key];
  let query = getSupabaseAdmin().from(cfg.table).select("*");
  for (const col of cfg.orderBy) query = query.order(col, { ascending: true, nullsFirst: false });
  const { data, error } = await query.order("id", { ascending: true }).range(0, MAX_ROWS - 1);
  if (error) throw tableError(`${cfg.label} 조회`, cfg.table, error.message);
  return (data ?? []) as KnowledgeRow[];
}

/** 거래처 정보 선택 팝업 데이터: 공정표 순서대로 공정 목록(중복 제거)과 공정별거래처 전체 */
export async function fetchVendorPickerData(): Promise<VendorPickerData> {
  const [schedule, vendors] = await Promise.all([fetchKnowledgeRows("schedule"), fetchKnowledgeRows("vendors")]);
  const seen = new Set<string>();
  const processes: VendorPickerData["processes"] = [];
  for (const r of schedule) {
    const name = typeof r.공정 === "string" ? r.공정.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    processes.push({ 공정: name, 주요작업: (r["주요 작업"] as string | null) ?? null });
  }
  return { processes, vendors };
}

/** 화면 입력값을 저장할 값으로 바꾼다. 설정에 없는 컬럼은 버린다. 잘못된 값이면 오류 문구 */
export function toRecord(key: KnowledgeTableKey, input: KnowledgeInput): Record<string, string | number | null> | string {
  const record: Record<string, string | number | null> = {};
  for (const col of KNOWLEDGE_TABLES[key].columns) {
    const raw = String(input[col.key] ?? "").replace(/\r\n/g, "\n").trim();
    if (raw.length > 2000) return `${col.key}은(는) 2000자 이내로 입력하세요`;
    if (col.type === "int") {
      if (raw === "") record[col.key] = null;
      else if (/^-?\d{1,9}$/.test(raw.replace(/,/g, ""))) record[col.key] = Number(raw.replace(/,/g, ""));
      else return `${col.key}은(는) 숫자로 입력하세요`;
    } else {
      record[col.key] = raw === "" ? null : raw;
    }
  }
  if (Object.values(record).every((v) => v === null)) return "내용을 하나 이상 입력하세요";
  return record;
}

export async function insertKnowledgeRow(key: KnowledgeTableKey, record: Record<string, string | number | null>): Promise<number> {
  const cfg = KNOWLEDGE_TABLES[key];
  const { data, error } = await getSupabaseAdmin().from(cfg.table).insert(record).select("id").single();
  if (error) throw tableError(`${cfg.label} 추가`, cfg.table, error.message);
  return (data as { id: number }).id;
}

export async function updateKnowledgeRow(
  key: KnowledgeTableKey,
  id: number,
  record: Record<string, string | number | null>,
): Promise<void> {
  const cfg = KNOWLEDGE_TABLES[key];
  const { data, error } = await getSupabaseAdmin().from(cfg.table).update(record).eq("id", id).select("id");
  if (error) throw tableError(`${cfg.label} 수정`, cfg.table, error.message);
  if (!data?.length) throw new Error("수정할 행을 찾을 수 없습니다 (이미 삭제되었을 수 있습니다)");
}

export async function deleteKnowledgeRow(key: KnowledgeTableKey, id: number): Promise<void> {
  const cfg = KNOWLEDGE_TABLES[key];
  const { error } = await getSupabaseAdmin().from(cfg.table).delete().eq("id", id);
  if (error) throw tableError(`${cfg.label} 삭제`, cfg.table, error.message);
}

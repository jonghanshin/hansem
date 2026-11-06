"use server";

import { refresh } from "next/cache";

import { authorizeAction } from "@/lib/auth";
import { deleteKnowledgeRow, insertKnowledgeRow, toRecord, updateKnowledgeRow } from "@/lib/knowledge";
import { isKnowledgeKey, type KnowledgeInput } from "@/lib/knowledge-shared";
import type { ActionResult } from "@/lib/sites";

// 지식자산(공정별거래처·타공정거래처·공정표) 추가·수정·삭제. 로그인한 사용자는 누구나 할 수 있다.

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/** id가 null이면 새 행 추가, 있으면 그 행 수정 */
export async function saveKnowledgeRowAction(
  tableKey: string,
  id: number | null,
  input: KnowledgeInput,
): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!isKnowledgeKey(tableKey)) return { ok: false, error: "잘못된 테이블입니다" };
  if (id !== null && !validId(id)) return { ok: false, error: "잘못된 행 번호입니다" };
  if (typeof input !== "object" || input === null) return { ok: false, error: "입력값이 올바르지 않습니다" };
  const record = toRecord(tableKey, input);
  if (typeof record === "string") return { ok: false, error: record };
  try {
    let savedId = id;
    if (savedId === null) savedId = await insertKnowledgeRow(tableKey, record);
    else await updateKnowledgeRow(tableKey, savedId, record);
    refresh();
    return { ok: true, data: { id: savedId } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteKnowledgeRowAction(tableKey: string, id: number): Promise<ActionResult<null>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!isKnowledgeKey(tableKey)) return { ok: false, error: "잘못된 테이블입니다" };
  if (!validId(id)) return { ok: false, error: "잘못된 행 번호입니다" };
  try {
    await deleteKnowledgeRow(tableKey, id);
    refresh();
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

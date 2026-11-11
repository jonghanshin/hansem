"use server";

import { authorizeAction } from "@/lib/auth";
import { isBlockedFile } from "@/lib/board-shared";
import { writeReceipt } from "@/lib/receipt-files";
import { RECEIPT_MAX_BYTES } from "@/lib/receipt-files-shared";
import type { ActionResult } from "@/lib/sites";

/**
 * 입금 등록·수정 화면에서 고른 영수증 파일을 upload/receipt에 저장하고,
 * 영수증 컬럼에 넣을 정보(JSON 문자열)를 돌려준다. 실제 컬럼 저장은 승인 요청과 함께 한다.
 */
export async function uploadReceiptAction(formData: FormData): Promise<ActionResult<string>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "영수증 파일을 선택하세요" };
  if (file.size > RECEIPT_MAX_BYTES) return { ok: false, error: "영수증 파일은 10MB까지 올릴 수 있습니다" };
  if (isBlockedFile(file.name)) return { ok: false, error: "실행 파일 형식은 올릴 수 없습니다" };
  try {
    return { ok: true, data: JSON.stringify(await writeReceipt(file)) };
  } catch (e) {
    return { ok: false, error: `영수증 저장 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

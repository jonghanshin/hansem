import "server-only";

// 영수증 실제 파일은 서버의 upload/receipt 폴더에 임의의 이름으로 저장한다.
// upload 폴더는 public 밖에 있어 직접 접근할 수 없고, 로그인·조회 권한 확인 후 /deposits/receipts/[stored]로만 내려받는다.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isReceiptStoredName, type ReceiptInfo } from "@/lib/receipt-files-shared";

const RECEIPT_DIR = path.join(process.cwd(), "upload", "receipt");

function storedPath(stored: string): string {
  if (!isReceiptStoredName(stored)) throw new Error("잘못된 파일 이름입니다");
  return path.join(RECEIPT_DIR, stored);
}

/** 원본 파일명: 경로 부분과 제어문자를 빼고 길이 제한 */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

export async function writeReceipt(file: File): Promise<ReceiptInfo> {
  const ext = path.extname(file.name).toLowerCase();
  const stored = `${Date.now()}-${randomUUID()}${/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ""}`;
  await mkdir(RECEIPT_DIR, { recursive: true });
  await writeFile(storedPath(stored), Buffer.from(await file.arrayBuffer()));
  return { name: cleanFileName(file.name), stored, size: file.size, uploadedAt: new Date().toISOString() };
}

export async function readReceipt(stored: string): Promise<Buffer> {
  return readFile(storedPath(stored));
}

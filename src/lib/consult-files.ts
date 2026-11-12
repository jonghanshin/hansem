import "server-only";

// 상담노트 첨부파일의 실제 파일은 서버의 upload/consult 폴더에 임의의 이름으로 저장한다.
// upload 폴더는 public 밖에 있어 직접 접근할 수 없고, 로그인·조회 권한 확인 후 /consult/[id]/files/[stored]로만 내려받는다.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { CONSULT_STORED_NAME_RE, type ConsultFile } from "@/lib/consult-shared";

const DIR = path.join(process.cwd(), "upload", "consult");

/** 경로 조작 방지: upload/consult 바로 아래, 정해진 형식의 이름만 */
function storedPath(stored: string): string {
  if (!CONSULT_STORED_NAME_RE.test(stored) || path.basename(stored) !== stored) throw new Error("잘못된 파일 이름입니다");
  return path.join(DIR, stored);
}

/** 원본 파일명: 경로 부분과 제어문자를 빼고 길이 제한 */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

export async function writeConsultFile(file: File, by: string): Promise<ConsultFile> {
  const ext = path.extname(file.name).toLowerCase();
  const stored = `${Date.now()}-${randomUUID()}${/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ""}`;
  await mkdir(DIR, { recursive: true });
  await writeFile(storedPath(stored), Buffer.from(await file.arrayBuffer()));
  return { name: cleanFileName(file.name), stored, size: file.size, uploadedAt: new Date().toISOString(), by };
}

export async function readConsultFile(stored: string): Promise<Buffer> {
  return readFile(storedPath(stored));
}

/** 저장된 파일 삭제 (없으면 무시, 실패해도 기록만 남긴다) */
export async function removeConsultFile(stored: string): Promise<void> {
  await rm(storedPath(stored), { force: true }).catch((e) => console.error("[consult-files] 파일 삭제 실패:", stored, e));
}

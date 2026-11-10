import "server-only";

// 현장 첨부 문서의 실제 파일은 서버의 upload/contract, upload/estimate, upload/material 폴더에 임의의 이름으로 저장한다.
// upload 폴더는 public 밖에 있어 직접 접근할 수 없고, 로그인·조회 권한 확인 후 /sites/[siteId]/files/[kind]로만 내려받는다.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SiteFileInfo, SiteFileKind } from "@/lib/site-files-shared";

const UPLOAD_ROOT = path.join(process.cwd(), "upload");

/** 경로 조작 방지: upload/<kind> 바로 아래 파일만 */
function storedPath(kind: SiteFileKind, storedName: string): string {
  const base = path.basename(storedName);
  if (base !== storedName || !base) throw new Error("잘못된 파일 이름입니다");
  return path.join(UPLOAD_ROOT, kind, base);
}

/** 원본 파일명: 경로 부분과 제어문자를 빼고 길이 제한 */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

/** 파일을 저장하고 컬럼에 넣을 정보를 돌려준다 */
export async function writeSiteFile(kind: SiteFileKind, file: File): Promise<SiteFileInfo> {
  const ext = path.extname(file.name).toLowerCase();
  const stored = `${Date.now()}-${randomUUID()}${/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ""}`;
  await mkdir(path.join(UPLOAD_ROOT, kind), { recursive: true });
  await writeFile(storedPath(kind, stored), Buffer.from(await file.arrayBuffer()));
  return { name: cleanFileName(file.name), stored, size: file.size, uploadedAt: new Date().toISOString() };
}

export async function readSiteFile(kind: SiteFileKind, info: SiteFileInfo): Promise<Buffer> {
  return readFile(storedPath(kind, info.stored));
}

/** 저장된 파일 삭제 (없으면 무시, 실패해도 기록만 남긴다) */
export async function removeSiteFile(kind: SiteFileKind, info: SiteFileInfo | null): Promise<void> {
  if (!info) return;
  await rm(storedPath(kind, info.stored), { force: true }).catch((e) =>
    console.error("[site-files] 파일 삭제 실패:", kind, info.stored, e),
  );
}

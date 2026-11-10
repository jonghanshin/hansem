// 현장 첨부 문서(최종계약서·최종견적서·자재리스트): 서버와 화면이 함께 쓰는 정의

export const SITE_FILE_KINDS = [
  { kind: "contract", column: "최종계약서" },
  { kind: "estimate", column: "최종견적서" },
  { kind: "material", column: "자재리스트" },
] as const;

export type SiteFileKind = (typeof SITE_FILE_KINDS)[number]["kind"];
export type SiteFileColumn = (typeof SITE_FILE_KINDS)[number]["column"];

/** 파일 하나 최대 크기 (next.config의 bodySizeLimit보다 작아야 함) */
export const SITE_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** 현장정보의 문서 컬럼에 JSON으로 저장하는 내려받기 정보 */
export type SiteFileInfo = {
  /** 사용자가 올린 원래 파일 이름 */
  name: string;
  /** upload/<kind>/ 아래 실제 저장 이름 */
  stored: string;
  size: number;
  uploadedAt: string;
};

export function isSiteFileKind(value: unknown): value is SiteFileKind {
  return SITE_FILE_KINDS.some((k) => k.kind === value);
}

export function siteFileColumn(kind: SiteFileKind): SiteFileColumn {
  return SITE_FILE_KINDS.find((k) => k.kind === kind)!.column;
}

/** 컬럼 값 → 파일 정보 (비어 있거나 형식이 다르면 null) */
export function parseSiteFile(value: unknown): SiteFileInfo | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const v = JSON.parse(value) as Partial<SiteFileInfo>;
    return typeof v.name === "string" && typeof v.stored === "string"
      ? { name: v.name, stored: v.stored, size: Number(v.size) || 0, uploadedAt: String(v.uploadedAt ?? "") }
      : null;
  } catch {
    return null;
  }
}

export function siteFileDownloadUrl(siteId: number, kind: SiteFileKind): string {
  return `/sites/${siteId}/files/${kind}`;
}

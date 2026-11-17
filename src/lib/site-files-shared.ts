// 현장 첨부 문서(최종계약서·최종견적서·자재리스트·참고파일): 서버와 화면이 함께 쓰는 정의

export const SITE_FILE_KINDS = [
  { kind: "contract", column: "최종계약서" },
  { kind: "estimate", column: "최종견적서" },
  { kind: "material", column: "자재리스트" },
  { kind: "reference", column: "참고파일" },
] as const;

export type SiteFileKind = (typeof SITE_FILE_KINDS)[number]["kind"];
export type SiteFileColumn = (typeof SITE_FILE_KINDS)[number]["column"];

/** 파일 하나 최대 크기 (next.config의 bodySizeLimit보다 작아야 함) */
export const SITE_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** 현장정보의 문서 컬럼에 JSON으로 저장하는 내려받기 정보 (참고파일은 이 객체의 배열) */
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
  return parseSiteFiles(value)[0] ?? null;
}

/** 여러 파일을 올릴 수 있는 문서 종류 (컬럼에 SiteFileInfo 배열 JSON으로 저장) */
export const MULTI_SITE_FILE_KINDS: readonly SiteFileKind[] = ["reference"];

/** 여러 파일 문서 하나에 올릴 수 있는 최대 개수 */
export const SITE_FILE_MAX_COUNT = 30;

export function isMultiSiteFileKind(kind: SiteFileKind): boolean {
  return MULTI_SITE_FILE_KINDS.includes(kind);
}

function toSiteFileInfo(v: unknown): SiteFileInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<SiteFileInfo>;
  return typeof o.name === "string" && typeof o.stored === "string"
    ? { name: o.name, stored: o.stored, size: Number(o.size) || 0, uploadedAt: String(o.uploadedAt ?? "") }
    : null;
}

/** 컬럼 값 → 파일 정보 목록 (단일 객체·배열 모두 읽는다. 비어 있거나 형식이 다르면 빈 배열) */
export function parseSiteFiles(value: unknown): SiteFileInfo[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const v: unknown = JSON.parse(value);
    const list = Array.isArray(v) ? v : [v];
    return list.map(toSiteFileInfo).filter((x): x is SiteFileInfo => x !== null);
  } catch {
    return [];
  }
}

/** 내려받기 주소. 여러 파일 문서는 저장 이름(stored)으로 어느 파일인지 고른다 */
export function siteFileDownloadUrl(siteId: number, kind: SiteFileKind, stored?: string): string {
  const base = `/sites/${siteId}/files/${kind}`;
  return stored ? `${base}?f=${encodeURIComponent(stored)}` : base;
}

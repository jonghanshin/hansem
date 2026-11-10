"use client";

import { useState, useTransition } from "react";

import { deleteSiteFileAction, uploadSiteFileAction } from "@/app/site-file-actions";
import { formatFileSize, isBlockedFile } from "@/lib/board-shared";
import {
  parseSiteFile,
  SITE_FILE_KINDS,
  SITE_FILE_MAX_BYTES,
  siteFileDownloadUrl,
  type SiteFileKind,
} from "@/lib/site-files-shared";
import type { Site } from "@/lib/sites";

/** 현장 상세의 최종계약서·최종견적서·자재리스트 업로드/내려받기 */
export function SiteFilesSection({ site, onChange }: { site: Site | null; onChange: (site: Site) => void }) {
  const [busy, setBusy] = useState<SiteFileKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!site) {
    return <p className="mt-3 text-xs text-zinc-500">최종계약서·최종견적서·자재리스트는 현장을 등록한 뒤 올릴 수 있습니다.</p>;
  }
  const siteId = site.id;

  function upload(kind: SiteFileKind, file: File | undefined) {
    if (!file) return;
    setError(null);
    if (isBlockedFile(file.name)) return setError("실행 파일 형식은 올릴 수 없습니다");
    if (file.size > SITE_FILE_MAX_BYTES) return setError(`파일은 ${formatFileSize(SITE_FILE_MAX_BYTES)}까지 올릴 수 있습니다`);
    const formData = new FormData();
    formData.set("file", file);
    setBusy(kind);
    startTransition(async () => {
      const res = await uploadSiteFileAction(siteId, kind, formData);
      setBusy(null);
      if (res.ok) onChange(res.data);
      else setError(res.error);
    });
  }

  function remove(kind: SiteFileKind, label: string, name: string) {
    if (!window.confirm(`${label} 파일(${name})을 삭제하시겠습니까? (되돌릴 수 없습니다)`)) return;
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const res = await deleteSiteFileAction(siteId, kind);
      setBusy(null);
      if (res.ok) onChange(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {SITE_FILE_KINDS.map(({ kind, column }) => {
        const info = parseSiteFile(site[column]);
        const working = busy === kind;
        return (
          <div key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-200 px-3 py-2">
            <span className="w-20 shrink-0 text-xs font-medium text-zinc-700">{column}</span>
            <div className="min-w-0 flex-1 text-sm">
              {info ? (
                <a
                  href={siteFileDownloadUrl(siteId, kind)}
                  className="block truncate font-medium text-blue-700 hover:underline"
                  title={`${info.name} 내려받기`}
                >
                  {info.name}
                  <span className="ml-1.5 text-xs font-normal text-zinc-500">
                    {formatFileSize(info.size)}
                    {info.uploadedAt && ` · ${new Date(info.uploadedAt).toLocaleDateString("ko-KR")}`}
                  </span>
                </a>
              ) : (
                <span className="text-xs text-zinc-400">{working ? "올리는 중…" : "파일 없음"}</span>
              )}
            </div>
            <label
              className={`shrink-0 cursor-pointer rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 ${
                pending ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {working ? "처리 중…" : info ? "변경" : "업로드"}
              <input
                type="file"
                className="sr-only"
                disabled={pending}
                onChange={(e) => {
                  upload(kind, e.target.files?.[0]);
                  e.target.value = ""; // 같은 파일을 다시 선택해도 동작하도록
                }}
              />
            </label>
            {info && (
              <button
                type="button"
                onClick={() => remove(kind, column, info.name)}
                disabled={pending}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                삭제
              </button>
            )}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

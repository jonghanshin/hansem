"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { deleteSiteFileAction, uploadSiteFileAction } from "@/app/site-file-actions";
import { formatFileSize, isBlockedFile } from "@/lib/board-shared";
import {
  isMultiSiteFileKind,
  parseSiteFiles,
  SITE_FILE_KINDS,
  SITE_FILE_MAX_BYTES,
  SITE_FILE_MAX_COUNT,
  siteFileDownloadUrl,
  type SiteFileColumn,
  type SiteFileInfo,
  type SiteFileKind,
} from "@/lib/site-files-shared";
import type { Site } from "@/lib/sites";

/** 현장 상세의 최종계약서·최종견적서·자재리스트·참고파일 업로드/내려받기 (참고파일은 여러 개) */
export function SiteFilesSection({ site, onChange }: { site: Site | null; onChange: (site: Site) => void }) {
  const [busy, setBusy] = useState<SiteFileKind | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** 방금 올린 파일(저장 이름) — 잠깐 "✓ 저장됨"을 보여준다 */
  const [justSaved, setJustSaved] = useState<ReadonlySet<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  function markSaved(stored: string[]) {
    if (stored.length === 0) return;
    setJustSaved((prev) => new Set([...prev, ...stored]));
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setJustSaved(new Set()), 5000);
  }

  if (!site) {
    return <p className="mt-3 text-xs text-zinc-500">최종계약서·최종견적서·자재리스트·참고파일은 현장을 등록한 뒤 올릴 수 있습니다.</p>;
  }
  const siteId = site.id;

  /** 고른 파일들을 검사하고, 한 파일씩 차례로 올린다 (요청 크기 제한 때문에 나눠 보냄) */
  function upload(kind: SiteFileKind, column: SiteFileColumn, picked: File[], currentCount: number) {
    if (picked.length === 0) return;
    setError(null);
    const multi = isMultiSiteFileKind(kind);
    const files = multi ? picked : picked.slice(0, 1);
    const blocked = files.find((f) => isBlockedFile(f.name));
    if (blocked) return setError(`실행 파일 형식은 올릴 수 없습니다 (${blocked.name})`);
    const tooBig = files.find((f) => f.size > SITE_FILE_MAX_BYTES);
    if (tooBig) return setError(`파일은 ${formatFileSize(SITE_FILE_MAX_BYTES)}까지 올릴 수 있습니다 (${tooBig.name})`);
    if (multi && currentCount + files.length > SITE_FILE_MAX_COUNT) {
      return setError(`파일은 ${SITE_FILE_MAX_COUNT}개까지 올릴 수 있습니다 (지금 ${currentCount}개)`);
    }

    // 응답마다 새로 생긴 파일(저장 이름)을 찾아 "✓ 저장됨" 표시에 쓴다
    const known = new Set(parseSiteFiles(site?.[column]).map((f) => f.stored));
    setBusy(kind);
    startTransition(async () => {
      const failed: string[] = [];
      for (const [i, file] of files.entries()) {
        if (files.length > 1) setProgress(`${i + 1}/${files.length}`);
        const formData = new FormData();
        formData.set("file", file);
        const res = await uploadSiteFileAction(siteId, kind, formData);
        if (res.ok) {
          onChange(res.data);
          const added = parseSiteFiles(res.data[column]).filter((f) => !known.has(f.stored)).map((f) => f.stored);
          added.forEach((stored) => known.add(stored));
          markSaved(added);
        } else failed.push(`${file.name}: ${res.error}`);
      }
      setBusy(null);
      setProgress(null);
      if (failed.length) setError(`올리지 못한 파일이 있습니다 — ${failed.join(" / ")}`);
    });
  }

  function remove(kind: SiteFileKind, label: string, info: SiteFileInfo) {
    if (!window.confirm(`${label} 파일(${info.name})을 삭제하시겠습니까? (되돌릴 수 없습니다)`)) return;
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const res = await deleteSiteFileAction(siteId, kind, isMultiSiteFileKind(kind) ? info.stored : undefined);
      setBusy(null);
      if (res.ok) onChange(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-zinc-500">
        ⓘ 파일은 올리는 즉시 저장됩니다. 파일만 올렸다면 아래 <b className="font-medium text-zinc-600">저장</b> 버튼을 누르지 않아도 됩니다.
      </p>
      {SITE_FILE_KINDS.map(({ kind, column }) => {
        const multi = isMultiSiteFileKind(kind);
        const files = parseSiteFiles(site[column]);
        const shown = multi ? files : files.slice(0, 1);
        const working = busy === kind;
        return (
          <div key={kind} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-zinc-200 px-3 py-2">
            <span className="w-20 shrink-0 pt-0.5 text-xs font-medium text-zinc-700">
              {column}
              {multi && files.length > 0 && <span className="ml-1 font-normal text-zinc-500">({files.length})</span>}
            </span>
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              {shown.length === 0 ? (
                <span className="text-xs text-zinc-400">{working ? "올리는 중…" : "파일 없음"}</span>
              ) : (
                shown.map((info) => (
                  <div key={info.stored} className="flex items-center gap-2">
                    <a
                      href={siteFileDownloadUrl(siteId, kind, multi ? info.stored : undefined)}
                      className="block min-w-0 flex-1 truncate font-medium text-blue-700 hover:underline"
                      title={`${info.name} 내려받기`}
                    >
                      {info.name}
                      <span className="ml-1.5 text-xs font-normal text-zinc-500">
                        {formatFileSize(info.size)}
                        {info.uploadedAt && ` · ${new Date(info.uploadedAt).toLocaleDateString("ko-KR")}`}
                      </span>
                    </a>
                    {justSaved.has(info.stored) && (
                      <span role="status" className="shrink-0 text-xs font-semibold text-green-600">
                        ✓ 저장됨
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(kind, column, info)}
                      disabled={pending}
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
            <label
              className={`shrink-0 cursor-pointer rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 ${
                pending ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {working ? `처리 중…${progress ? ` ${progress}` : ""}` : multi ? "추가" : files.length ? "변경" : "업로드"}
              <input
                type="file"
                multiple={multi}
                className="sr-only"
                disabled={pending}
                onChange={(e) => {
                  upload(kind, column, Array.from(e.target.files ?? []), files.length);
                  e.target.value = ""; // 같은 파일을 다시 선택해도 동작하도록
                }}
              />
            </label>
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

"use client";

import { useRef, useState, useTransition } from "react";

import { deleteAsPhotoAction, uploadAsPhotoAction } from "@/app/as-actions";
import { AS_FILE_MAX_BYTES, AS_FILES_MAX, AS_PHOTO_KINDS, asFileUrl, type AsPhoto, type AsPhotoKind } from "@/lib/as-shared";
import { formatFileSize } from "@/lib/consult-shared";

const PREVIEW_RE = /\.(jpe?g|png|gif|webp)$/i;
const KIND_HINT: Record<AsPhotoKind, string> = {
  접수: "접수할 때 증상 사진",
  완료: "처리 후 완료 사진",
  증빙: "영수증·견적서 등",
};

/** A/S 사진·증빙: 구분(접수/완료/증빙)을 골라 올리고, 구분별로 미리보기 */
export function AsPhotos({ caseId, photos, meName, canManage }: { caseId: number; photos: AsPhoto[]; meName: string; canManage: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AsPhotoKind>("접수");
  const [list, setList] = useState(photos);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const [shown, setShown] = useState(photos);
  if (shown !== photos) {
    setShown(photos);
    setList(photos);
  }

  function upload(selected: FileList | null) {
    if (!selected?.length) return;
    const picked = Array.from(selected);
    if (inputRef.current) inputRef.current.value = "";
    setErrors([]);
    startTransition(async () => {
      const failed: string[] = [];
      let count = list.length;
      for (const [i, file] of picked.entries()) {
        if (count >= AS_FILES_MAX) {
          failed.push(`사진·증빙은 ${AS_FILES_MAX}개까지 올릴 수 있습니다`);
          break;
        }
        if (file.size > AS_FILE_MAX_BYTES) {
          failed.push(`${file.name}: 파일은 20MB까지 올릴 수 있습니다`);
          continue;
        }
        setProgress(`${i + 1}/${picked.length} 올리는 중… ${file.name}`);
        const form = new FormData();
        form.set("file", file);
        form.set("kind", kind);
        const res = await uploadAsPhotoAction(caseId, form);
        if (res.ok) {
          setList(res.data);
          count = res.data.length;
        } else failed.push(res.error);
      }
      setProgress(null);
      setErrors(failed);
    });
  }

  function remove(p: AsPhoto) {
    if (!confirm(`${p.name} 파일을 삭제할까요?`)) return;
    setErrors([]);
    startTransition(async () => {
      const res = await deleteAsPhotoAction(caseId, p.stored);
      if (res.ok) setList(res.data);
      else setErrors([res.error]);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {AS_PHOTO_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-full border px-3 py-1 text-sm ${kind === k ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
            >
              {k} 사진
            </button>
          ))}
        </div>
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 px-4 py-5 text-center hover:border-blue-400 hover:bg-blue-50/40 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
        >
          <input ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={pending} />
          <span className="text-sm font-medium text-zinc-800">📷 &apos;{kind}&apos; 사진·파일 선택 (또는 끌어다 놓기)</span>
          <span className="mt-1 text-xs text-zinc-500">
            {KIND_HINT[kind]} · 파일당 20MB · 최대 {AS_FILES_MAX}개 · 휴대폰은 바로 촬영 가능
          </span>
        </label>
        {progress && <p className="text-sm text-blue-700">{progress}</p>}
        {errors.length > 0 && (
          <ul className="space-y-0.5 text-sm text-red-600">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      {AS_PHOTO_KINDS.map((k) => {
        const group = list.filter((p) => p.kind === k);
        if (group.length === 0) return null;
        return (
          <div key={k}>
            <h3 className="mb-1.5 text-xs font-semibold text-zinc-600">
              {k} 사진 {group.length}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {group.map((p) => (
                <li key={p.stored} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                  <a href={asFileUrl(caseId, p.stored)} className="block">
                    {PREVIEW_RE.test(p.name) ? (
                      // 로그인 확인 후 내려주는 사진이라 next/image 최적화 대신 그대로 보여준다
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${asFileUrl(caseId, p.stored)}?inline=1`} alt={p.name} className="aspect-square w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex aspect-square items-center justify-center bg-zinc-50 text-3xl">{/\.pdf$/i.test(p.name) ? "📄" : "📁"}</span>
                    )}
                  </a>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-600" title={`${p.name} · ${formatFileSize(p.size)} · ${p.by}`}>
                      {p.name}
                    </span>
                    {(p.by === meName || canManage) && (
                      <button type="button" onClick={() => remove(p)} disabled={pending} className="shrink-0 text-xs text-zinc-400 hover:text-red-600" aria-label={`${p.name} 삭제`}>
                        삭제
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {list.length === 0 && <p className="py-3 text-center text-sm text-zinc-500">올린 사진·증빙이 없습니다.</p>}
    </div>
  );
}

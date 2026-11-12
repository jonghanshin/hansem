"use client";

import { useRef, useState, useTransition } from "react";

import { deleteConsultFileAction, uploadConsultFileAction } from "@/app/consult-actions";
import {
  CONSULT_FILE_MAX_BYTES,
  CONSULT_FILES_MAX,
  consultFileUrl,
  formatFileSize,
  type ConsultFile,
} from "@/lib/consult-shared";

const IMAGE_RE = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;

/** 상담노트 첨부파일: 여러 개를 골라 하나씩 올리고, 목록에서 내려받기·삭제 */
export function ConsultFiles({
  consultId,
  files,
  meName,
  canManage,
}: {
  consultId: number;
  files: ConsultFile[];
  meName: string;
  canManage: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState(files);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  // 서버에서 새 목록이 오면(다른 사람이 올린 경우 등) 그 값으로
  const [shown, setShown] = useState(files);
  if (shown !== files) {
    setShown(files);
    setList(files);
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
        if (count >= CONSULT_FILES_MAX) {
          failed.push(`첨부파일은 ${CONSULT_FILES_MAX}개까지 올릴 수 있습니다`);
          break;
        }
        if (file.size > CONSULT_FILE_MAX_BYTES) {
          failed.push(`${file.name}: 파일은 20MB까지 올릴 수 있습니다`);
          continue;
        }
        setProgress(`${i + 1}/${picked.length} 올리는 중… ${file.name}`);
        const form = new FormData();
        form.set("file", file);
        const res = await uploadConsultFileAction(consultId, form);
        if (res.ok) {
          setList(res.data);
          count = res.data.length;
        } else failed.push(res.error);
      }
      setProgress(null);
      setErrors(failed);
    });
  }

  function remove(f: ConsultFile) {
    if (!confirm(`${f.name} 파일을 삭제할까요?`)) return;
    setErrors([]);
    startTransition(async () => {
      const res = await deleteConsultFileAction(consultId, f.stored);
      if (res.ok) setList(res.data);
      else setErrors([res.error]);
    });
  }

  return (
    <div className="space-y-3">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-center hover:border-blue-400 hover:bg-blue-50/40 ${
          pending ? "pointer-events-none opacity-60" : ""
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <input ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={pending} />
        <span className="text-sm font-medium text-zinc-800">📎 파일 선택 또는 여기로 끌어다 놓기</span>
        <span className="mt-1 text-xs text-zinc-500">
          상담 PDF·현장 사진·도면 등 · 파일당 20MB · 최대 {CONSULT_FILES_MAX}개 (휴대폰에서는 사진 촬영도 가능)
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

      {list.length === 0 ? (
        <p className="py-3 text-center text-sm text-zinc-500">첨부한 파일이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
          {list.map((f) => (
            <li key={f.stored} className="flex items-center gap-3 px-3 py-2">
              <span className="text-lg" aria-hidden>
                {IMAGE_RE.test(f.name) ? "🖼️" : /\.pdf$/i.test(f.name) ? "📄" : "📁"}
              </span>
              <div className="min-w-0 flex-1">
                <a href={consultFileUrl(consultId, f.stored)} className="block truncate text-sm font-medium text-blue-700 hover:underline">
                  {f.name}
                </a>
                <span className="text-xs text-zinc-500">
                  {formatFileSize(f.size)} · {f.by} · {f.uploadedAt.slice(0, 10)}
                </span>
              </div>
              {(f.by === meName || canManage) && (
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={pending}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`${f.name} 삭제`}
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

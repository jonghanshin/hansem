"use client";

import { useState, useTransition } from "react";

import { insertSitesAction, parseExcelAction, type ExcelPreview } from "@/app/actions";
import { formatMoney, type Site } from "@/lib/sites";

export function ExcelUploadDialog({
  onClose,
  onInserted,
}: {
  onClose: () => void;
  onInserted: (sites: Site[]) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await parseExcelAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.data);
      // 오류 없는 행은 기본 선택, 중복(현장번호 이미 존재)은 기본 해제
      setChecked(
        new Set(res.data.rows.filter((r) => r.errors.length === 0 && !r.duplicate).map((r) => r.rowNumber)),
      );
    });
  }

  function toggle(rowNumber: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function submit() {
    if (!preview) return;
    const rows = preview.rows.filter((r) => checked.has(r.rowNumber)).map((r) => r.data);
    setError(null);
    startTransition(async () => {
      const res = await insertSitesAction(rows);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onInserted(res.data);
    });
  }

  const rows = preview?.rows ?? [];
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  const dupCount = rows.filter((r) => r.duplicate).length;
  const selectable = rows.filter((r) => r.errors.length === 0 && !r.duplicate);
  const allChecked = selectable.length > 0 && selectable.every((r) => checked.has(r.rowNumber));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        className="flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-zinc-900">
              엑셀 업로드
            </h2>
            <p className="text-xs text-zinc-500">
              첫 행에 컬럼명(현장번호, 고객명, 고객전화번호 …)이 있는 .xlsx 파일을 올려주세요.{" "}
              <a href="/template" className="font-medium text-blue-600 hover:underline">
                양식 다운로드
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="닫기"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-center hover:border-blue-400 hover:bg-blue-50/40">
            <span className="text-sm font-medium text-zinc-800">
              {fileName ?? "클릭해서 엑셀 파일 선택"}
            </span>
            <span className="text-xs text-zinc-500">.xlsx · 최대 5MB</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = ""; // 같은 파일을 다시 선택해도 동작하도록
              }}
            />
          </label>

          {pending && !preview && <p className="mt-4 text-sm text-zinc-500">파일을 읽는 중…</p>}

          {preview && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-zinc-800">
                  총 <b>{rows.length}</b>행
                </span>
                {errorCount > 0 && <span className="text-red-600">오류 {errorCount}행 (등록 불가)</span>}
                {dupCount > 0 && <span className="text-amber-700">현장번호 중복 {dupCount}행 (등록 불가)</span>}
                {preview.ignoredColumns.length > 0 && (
                  <span className="text-zinc-500">무시된 컬럼: {preview.ignoredColumns.join(", ")}</span>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-600">
                    <tr>
                      <th className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label="전체 선택"
                          checked={allChecked}
                          onChange={() =>
                            setChecked(allChecked ? new Set() : new Set(selectable.map((r) => r.rowNumber)))
                          }
                        />
                      </th>
                      <th className="px-2 py-2 font-medium">행</th>
                      <th className="px-2 py-2 font-medium">상태</th>
                      <th className="px-2 py-2 font-medium">현장번호</th>
                      <th className="px-2 py-2 font-medium">고객명</th>
                      <th className="px-2 py-2 font-medium">전화번호</th>
                      <th className="px-2 py-2 font-medium">영업사원</th>
                      <th className="px-2 py-2 font-medium">현장주소</th>
                      <th className="px-2 py-2 text-right font-medium">계약가</th>
                      <th className="px-2 py-2 font-medium">계약일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((r) => {
                      const invalid = r.errors.length > 0;
                      return (
                        <tr key={r.rowNumber} className={invalid ? "bg-red-50/60" : r.duplicate ? "bg-amber-50/60" : ""}>
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              aria-label={`${r.rowNumber}행 선택`}
                              disabled={invalid || !!r.duplicate}
                              checked={checked.has(r.rowNumber)}
                              onChange={() => toggle(r.rowNumber)}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-zinc-500 tabular-nums">{r.rowNumber}</td>
                          <td className="px-2 py-1.5">
                            {invalid ? (
                              <span className="text-red-700" title={r.errors.join("\n")}>
                                {r.errors.join(", ")}
                              </span>
                            ) : r.duplicate === "db" ? (
                              <span className="text-amber-700">이미 등록됨</span>
                            ) : r.duplicate === "file" ? (
                              <span className="text-amber-700">파일 내 중복</span>
                            ) : (
                              <span className="text-emerald-700">정상</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.data.현장번호}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.data.고객명}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{r.data.고객전화번호}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.data.영업사원}</td>
                          <td className="max-w-64 truncate px-2 py-1.5" title={r.data.현장주소 ?? ""}>
                            {r.data.현장주소}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(r.data.계약가)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{r.data.계약일}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-2 py-6 text-center text-zinc-500">
                          데이터 행이 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || checked.size === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {pending && preview ? "등록 중…" : `선택한 ${checked.size}건 등록`}
          </button>
        </div>
      </div>
    </div>
  );
}

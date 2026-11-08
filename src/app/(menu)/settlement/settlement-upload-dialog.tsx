"use client";

import { useEffect, useState, useTransition } from "react";

import { clearUploadTableAction, countUploadTableAction, uploadSettlementCsvAction } from "@/app/settlement-actions";
import { CSV_MAX_BYTES, UPLOAD_TABLES, type UploadTable } from "@/lib/settlement-upload";

/** CSV·엑셀을 테이블에 추가하거나 테이블 전체를 삭제하는 팝업 */
export function SettlementUploadDialog({
  table,
  onClose,
  onChanged,
}: {
  table: UploadTable;
  onClose: () => void;
  /** 테이블 내용이 바뀌었을 때 (이전 정산 결과를 비우는 용도) */
  onChanged: () => void;
}) {
  const label = UPLOAD_TABLES[table].label;
  const [count, setCount] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void countUploadTableAction(table).then((res) => {
      if (!active) return;
      if (res.ok) setCount(res.data);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, [table]);

  function chooseFile(next: File | undefined) {
    setMessage(null);
    setError(null);
    if (next && next.size > CSV_MAX_BYTES) {
      setFile(null);
      setError("파일은 10MB까지 올릴 수 있습니다");
      return;
    }
    setFile(next ?? null);
  }

  function upload() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await uploadSettlementCsvAction(table, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCount(res.data.total);
      setFile(null);
      setMessage(`${res.data.inserted.toLocaleString()}건을 추가했습니다.`);
      onChanged();
    });
  }

  function clearAll() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await clearUploadTableAction(table);
      setConfirming(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCount(0);
      setMessage(`${res.data.deleted.toLocaleString()}건을 삭제했습니다.`);
      onChanged();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !pending && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-upload-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="settlement-upload-title" className="text-base font-semibold text-zinc-900">
              {label}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
              현재 {count === null ? "확인 중…" : `${count.toLocaleString()}건`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300"
          >
            닫기
          </button>
        </div>

        <div className="space-y-4 overflow-auto px-5 py-4">
          <section>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-center hover:border-blue-400 hover:bg-blue-50/40">
              <span className="break-all text-sm font-medium text-zinc-800">{file?.name ?? "클릭해서 CSV 또는 엑셀 파일 선택"}</span>
              <span className="text-xs text-zinc-500">.csv, .xlsx · 최대 10MB</span>
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={pending}
                onChange={(e) => {
                  chooseFile(e.target.files?.[0]);
                  e.target.value = ""; // 같은 파일을 다시 선택해도 동작하도록
                }}
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              기존 데이터는 그대로 두고 뒤에 추가합니다. 같은 파일을 다시 올리면 중복으로 들어갑니다.
            </p>
            <button
              type="button"
              onClick={upload}
              disabled={pending || !file}
              className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {pending && file ? "업로드 중…" : "업로드"}
            </button>
          </section>

          {message && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <section className="border-t border-zinc-200 pt-4">
            {confirming ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800">
                  {label} 데이터 {count?.toLocaleString() ?? ""}건을 모두 삭제할까요?
                </p>
                <p className="mt-1 text-xs text-red-700">삭제하면 되돌릴 수 없고, 이 데이터를 쓰는 화면의 금액도 달라집니다.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={pending}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={pending}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-zinc-300"
                  >
                    {pending ? "삭제 중…" : "모두 삭제"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  setConfirming(true);
                }}
                disabled={pending || !count}
                className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-zinc-300 disabled:no-underline"
              >
                전체 데이터 삭제
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

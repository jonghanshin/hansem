"use client";

import { useState } from "react";

import { exportFileName, type ExportTable } from "@/lib/export-rows";
import { buildXlsx } from "@/lib/export-workbook";

async function downloadXlsx(table: ExportTable, fileName: string) {
  // exceljs(약 1MB)는 내보내기를 누를 때만 불러온다
  const { default: ExcelJS } = await import("exceljs");
  const buffer = await buildXlsx(ExcelJS, table);
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 현재 검색 조건에 맞는 전체 행(모든 페이지)을 엑셀로 내보낸다. */
export function ExportButton({ count, fileBase, build }: { count: number; fileBase: string; build: () => ExportTable }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await downloadXlsx(build(), exportFileName(fileBase));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || count === 0}
        title={`현재 검색 조건의 ${count.toLocaleString()}건(모든 페이지)을 엑셀로 내보냅니다`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
      >
        {busy ? (
          "내보내는 중…"
        ) : (
          <>
            엑셀<span className="hidden sm:inline"> 내보내기</span> ({count.toLocaleString()})
          </>
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          내보내기 실패: {error}
        </span>
      )}
    </>
  );
}

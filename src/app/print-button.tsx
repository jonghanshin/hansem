"use client";

/** 현재 화면 인쇄 (인쇄할 때 메뉴·목록은 print:hidden으로 숨긴다) */
export function PrintButton({ label = "인쇄", className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 print:hidden"
      }
    >
      {label}
    </button>
  );
}

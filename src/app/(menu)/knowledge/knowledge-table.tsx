"use client";

import { useId, useMemo, useState, useTransition } from "react";

import { deleteKnowledgeRowAction, saveKnowledgeRowAction } from "@/app/knowledge-actions";
import { KNOWLEDGE_TABLES, type KnowledgeInput, type KnowledgeRow, type KnowledgeTableKey } from "@/lib/knowledge-shared";

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function cellText(v: string | number | null | undefined): string {
  return v == null ? "" : String(v);
}

export function KnowledgeTable({ tableKey, rows }: { tableKey: KnowledgeTableKey; rows: KnowledgeRow[] }) {
  const cfg = KNOWLEDGE_TABLES[tableKey];
  const [q, setQ] = useState("");
  const [proc, setProc] = useState("");
  // undefined: 닫힘, null: 새 행 추가, 행: 수정
  const [editing, setEditing] = useState<KnowledgeRow | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  const processes = useMemo(
    () => [...new Set(rows.map((r) => cellText(r["공정"]).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [rows],
  );

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (proc && cellText(r["공정"]).trim() !== proc) return false;
      if (words.length === 0) return true;
      const text = cfg.columns.map((c) => cellText(r[c.key])).join(" ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, q, proc, cfg.columns]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 sm:px-6">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색 (업체, 성함, 연락처 등)"
          className={`${INPUT} w-full sm:w-64`}
          aria-label="검색어"
        />
        <select value={proc} onChange={(e) => setProc(e.target.value)} className={`${INPUT} w-auto`} aria-label="공정">
          <option value="">전체 공정</option>
          {processes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-sm text-zinc-500">
          {filtered.length === rows.length ? `${rows.length.toLocaleString()}건` : `${filtered.length} / ${rows.length}건`}
        </span>
        {notice && (
          <span role="status" className="text-sm text-emerald-700">
            {notice}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setEditing(null);
          }}
          className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + 추가
        </button>
      </div>

      <div className="flex-1 overflow-auto lg:min-h-0">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-xs text-zinc-600">
            <tr>
              {cfg.columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-left font-medium">
                  {c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => {
                  setNotice(null);
                  setEditing(r);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setNotice(null);
                    setEditing(r);
                  }
                }}
                tabIndex={0}
                className="cursor-pointer hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
                aria-label={`${cellText(r["공정"])} ${cellText(r["업체·소속"] ?? r["주요 작업"])} 수정`}
              >
                {cfg.columns.map((c) => {
                  const text = cellText(r[c.key]);
                  return (
                    <td
                      key={c.key}
                      title={text.length > 20 ? text : undefined}
                      className="border-b border-zinc-100 px-3 py-2 align-top text-zinc-800"
                      style={{ maxWidth: c.width ?? "12rem" }}
                    >
                      <span className="line-clamp-2 break-words">{text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-zinc-500">{rows.length === 0 ? "등록된 데이터가 없습니다." : "검색 결과가 없습니다."}</p>
        )}
      </div>

      {editing !== undefined && (
        <RowDialog
          tableKey={tableKey}
          row={editing}
          defaultProcess={proc}
          onClose={() => setEditing(undefined)}
          onDone={(message) => {
            setEditing(undefined);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}

function RowDialog({
  tableKey,
  row,
  defaultProcess,
  onClose,
  onDone,
}: {
  tableKey: KnowledgeTableKey;
  row: KnowledgeRow | null;
  defaultProcess: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const cfg = KNOWLEDGE_TABLES[tableKey];
  const idp = useId();
  const [values, setValues] = useState<KnowledgeInput>(() =>
    Object.fromEntries(
      cfg.columns.map((c) => [c.key, row ? cellText(row[c.key]) : c.key === "공정" ? defaultProcess : ""]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveKnowledgeRowAction(tableKey, row?.id ?? null, values);
      if (!res.ok) setError(res.error);
      else onDone(row ? "수정했습니다" : "추가했습니다");
    });
  }

  function remove() {
    if (!row) return;
    // 어떤 행인지 알아볼 수 있게 대표 값(공정·업체 등)을 함께 보여준다
    const label = ["공정", "업체", "업체·소속", "주요 작업", "성함", "업체담당자성함"]
      .map((k) => cellText(row[k]).trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");
    const warning = `⚠ ${cfg.label}에서 이 행을 삭제합니다.${label ? `\n\n${label}` : ""}\n\n삭제하면 되돌릴 수 없습니다. 삭제하시겠습니까?`;
    if (!confirm(warning)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteKnowledgeRowAction(tableKey, row.id);
      if (!res.ok) setError(res.error);
      else onDone("삭제했습니다");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && !pending && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idp}-title`}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 id={`${idp}-title`} className="text-lg font-semibold text-zinc-900">
            {cfg.label} {row ? "수정" : "추가"}
          </h2>
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

        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          {cfg.columns.map((c, i) => (
            <label key={c.key} className={c.multiline ? "sm:col-span-2" : undefined}>
              <span className="mb-1 block text-xs font-medium text-zinc-700">{c.key}</span>
              {c.multiline ? (
                <textarea
                  value={values[c.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                  rows={2}
                  className={INPUT}
                  autoFocus={i === 0}
                />
              ) : (
                <input
                  value={values[c.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                  inputMode={c.type === "int" ? "numeric" : undefined}
                  className={INPUT}
                  autoFocus={i === 0}
                />
              )}
            </label>
          ))}
        </div>

        <div className="border-t border-zinc-200 px-5 py-3">
          {error && (
            <p role="alert" className="mb-3 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            {row && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                삭제
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="ml-auto rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";

import { changeMyPasswordAction, type FormState } from "@/app/auth-actions";

/** 나의정보: 비밀번호 변경 (현재 비밀번호 확인 후 변경, 로그인은 유지) */
export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changeMyPasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // 변경에 성공하면 입력칸을 비운다
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <Field name="current" label="현재 비밀번호" autoComplete="current-password" />
      <Field name="password" label="새 비밀번호" autoComplete="new-password" minLength={minLength} hint={`${minLength}자리 이상`} />
      <Field name="confirm" label="새 비밀번호 확인" autoComplete="new-password" minLength={minLength} />

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "변경 중…" : "비밀번호 변경"}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  autoComplete,
  minLength,
  hint,
}: {
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 text-xs font-medium text-zinc-700">
        {label}
        {hint && <span className="font-normal text-zinc-400">{hint}</span>}
      </span>
      <input
        name={name}
        type="password"
        autoComplete={autoComplete}
        minLength={minLength}
        required
        className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </label>
  );
}

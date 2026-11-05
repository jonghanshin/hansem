"use client";

import { useActionState, useEffect } from "react";

import type { FormState } from "@/app/auth-actions";

type Field = {
  name: string;
  label: string;
  type: "text" | "password";
  autoComplete: string;
  minLength?: number;
};

/** 로그인 / 비밀번호 변경 화면이 공유하는 카드형 폼 */
export function AuthForm({
  title,
  description,
  fields,
  submitLabel,
  pendingLabel,
  action,
}: {
  title: string;
  description?: string;
  fields: Field[];
  submitLabel: string;
  pendingLabel: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const done = !!state.redirectTo;

  // 로그인 사용자가 바뀌므로 이전 화면 상태가 남지 않게 전체 새로고침으로 이동
  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-12">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 className="text-xl font-bold text-zinc-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}

        <div className="mt-6 space-y-4">
          {fields.map((f, i) => (
            <label key={f.name} className="block">
              <span className="text-sm font-medium text-zinc-700">{f.label}</span>
              <input
                name={f.name}
                type={f.type}
                autoComplete={f.autoComplete}
                minLength={f.minLength}
                defaultValue={f.type === "password" ? undefined : state.values?.[f.name]}
                required
                autoFocus={i === 0}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-base text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
              />
            </label>
          ))}
        </div>

        {state.error && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || done}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending || done ? pendingLabel : submitLabel}
        </button>
      </form>
    </main>
  );
}

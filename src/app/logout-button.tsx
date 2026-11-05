"use client";

import { useTransition } from "react";

import { logoutAction } from "@/app/auth-actions";

/** 로그아웃 후 전체 새로고침으로 로그인 화면에 이동한다 (숨겨 둔 이전 화면·데이터를 브라우저에서 지우기 위해) */
export function LogoutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          window.location.replace("/login");
        })
      }
    >
      로그아웃
    </button>
  );
}

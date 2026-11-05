import { LogoutButton } from "@/app/logout-button";
import { getSession } from "@/lib/auth";

/** 로그인한 사용자 이름 + 로그아웃 버튼. 쿠키를 읽으므로 <Suspense> 안에서 렌더링한다. */
export async function UserMenu({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const session = await getSession();
  if (!session) return null;
  const dark = tone === "dark";
  return (
    <div className="flex items-center gap-2">
      <span className={`hidden text-sm sm:inline ${dark ? "text-zinc-300" : "text-zinc-600"}`}>
        {session.name}
        {session.role && <span className={dark ? "text-zinc-500" : "text-zinc-400"}> · {session.role}</span>}
      </span>
      <LogoutButton
        className={`rounded px-2 py-1 text-sm font-medium disabled:opacity-60 ${
          dark
            ? "text-zinc-300 hover:bg-white/10 hover:text-white"
            : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
        }`}
      />
    </div>
  );
}

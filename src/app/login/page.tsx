import { loginAction } from "@/app/auth-actions";
import { AuthForm } from "@/app/auth-form";

export const metadata = { title: "로그인 | 현장정보 관리" };

export default function LoginPage() {
  return (
    <AuthForm
      title="현장정보 관리"
      description="영업사원 ID와 비밀번호로 로그인하세요."
      fields={[
        { name: "id", label: "ID", type: "text", autoComplete: "username" },
        { name: "password", label: "비밀번호", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="로그인"
      pendingLabel="로그인 중…"
      action={loginAction}
    />
  );
}

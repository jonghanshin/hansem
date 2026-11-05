import { changePasswordAction } from "@/app/auth-actions";
import { AuthForm } from "@/app/auth-form";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth";

export const metadata = { title: "비밀번호 변경 | 현장정보 관리" };

export default function ChangePasswordPage() {
  return (
    <AuthForm
      title="비밀번호 변경"
      description={`최초 접속입니다. 사용할 새 비밀번호(${MIN_PASSWORD_LENGTH}자리 이상)를 설정하세요.`}
      fields={[
        {
          name: "password",
          label: "새 비밀번호",
          type: "password",
          autoComplete: "new-password",
          minLength: MIN_PASSWORD_LENGTH,
        },
        {
          name: "confirm",
          label: "새 비밀번호 확인",
          type: "password",
          autoComplete: "new-password",
          minLength: MIN_PASSWORD_LENGTH,
        },
      ]}
      submitLabel="변경하고 시작하기"
      pendingLabel="변경 중…"
      action={changePasswordAction}
    />
  );
}
